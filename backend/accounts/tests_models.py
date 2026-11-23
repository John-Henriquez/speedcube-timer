"""Integridad del modelo de usuario garantizada por la base de datos, administración y creación por consola."""
import os
import uuid
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from timer.models import Attempt, AttemptMark, Session, Solve, SolveMark

from .models import AuthToken, GoogleIdentity, User


class UserIntegrity(TestCase):
    def rejected(self, fn):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                fn()

    def test_el_correo_se_guarda_normalizado(self):
        self.assertEqual(User.objects.create_user('ana', '  Ana@Example.COM ', 'x-clave-larga-1').email, 'ana@example.com')

    def test_dos_cuentas_no_comparten_correo_ni_siquiera_saltandose_save(self):
        User.objects.create_user('ana', 'ana@example.com', 'x-clave-larga-1')
        self.rejected(lambda: User.objects.create_user('otra', 'ANA@example.com', 'x-clave-larga-1'))
        # Escribir directamente en la base (sin pasar por save) tampoco permite saltarse las reglas:
        otra = User.objects.create_user('otra', 'otra@example.com', 'x-clave-larga-1')
        self.rejected(lambda: User.objects.filter(pk=otra.pk).update(email='ana@example.com'))
        self.rejected(lambda: User.objects.filter(pk=otra.pk).update(email='OTRA@EXAMPLE.COM'))  # solo minúsculas

    def test_varias_cuentas_pueden_no_tener_correo(self):
        User.objects.create_user('uno', '', 'x-clave-larga-1')
        User.objects.create_user('dos', '', 'x-clave-larga-1')
        self.assertEqual(User.objects.filter(email='').count(), 2)

    def test_el_usuario_no_distingue_mayusculas_en_la_base(self):
        User.objects.create_user('Ana', 'ana@example.com', 'x-clave-larga-1')
        self.rejected(lambda: User.objects.create_user('ana', 'otro@example.com', 'x-clave-larga-1'))

    def test_el_nombre_visible_es_opcional_y_por_defecto_se_muestra_el_usuario(self):
        user = User.objects.create_user('ana', 'ana@example.com', 'x-clave-larga-1')
        self.assertEqual(user.shown_name, 'ana')
        user.display_name = 'Ana C.'
        self.assertEqual(user.shown_name, 'Ana C.')

    def test_no_quedan_campos_de_nombre_y_apellido_sin_uso(self):
        names = {f.name for f in User._meta.get_fields()}
        self.assertTrue({'first_name', 'last_name'}.isdisjoint(names))
        self.assertTrue({'display_name', 'email', 'username'} <= names)

    def test_no_existe_una_tabla_de_perfiles_ni_de_tokens_estandar(self):
        from django.apps import apps
        self.assertNotIn('profile', [m._meta.model_name for m in apps.get_app_config('accounts').get_models()])
        self.assertFalse(apps.is_installed('rest_framework.authtoken'))


class Administrators(TestCase):
    def test_un_administrador_es_una_cuenta_normal_con_permisos_adicionales(self):
        admin = User.objects.create_superuser('admin', 'admin@example.com', 'x-clave-larga-1')
        normal = User.objects.create_user('ana', 'ana@example.com', 'x-clave-larga-1')
        self.assertEqual(type(admin), type(normal))
        self.assertEqual((admin.is_staff, admin.is_superuser), (True, True))
        self.assertEqual((normal.is_staff, normal.is_superuser), (False, False))
        self.assertNotIn('role', {f.name for f in User._meta.get_fields()}, 'no hay roles propios: se usan los de Django')

    def test_createsuperuser_por_consola_sin_correo(self):
        with mock.patch.dict(os.environ, {'DJANGO_SUPERUSER_PASSWORD': 'x-clave-larga-1'}):
            call_command('createsuperuser', interactive=False, username='admin', email='', stdout=StringIO())
            call_command('createsuperuser', interactive=False, username='admin2', email='', stdout=StringIO())  # otra sin correo
        admin = User.objects.get(username='admin')
        self.assertTrue(admin.is_superuser and admin.is_staff and admin.check_password('x-clave-larga-1'))
        self.assertEqual(User.objects.filter(is_superuser=True).count(), 2)

    def test_las_paginas_del_admin_funcionan_con_el_modelo_nuevo(self):
        admin = User.objects.create_superuser('admin', 'admin@example.com', 'x-clave-larga-1')
        self.client.force_login(admin)
        ana = User.objects.create_user('ana', 'ana@example.com', 'x-clave-larga-1')
        solve = Solve.objects.create(user=ana, time_ms=30000, inspection_ms=9000, ended_at=timezone.now())
        SolveMark.objects.create(solve=solve, stage='cross', elapsed_ms=4000)
        attempt = Attempt.objects.create(user=ana, zone='oll', time_ms=1500, ended_at=timezone.now())
        AttemptMark.objects.create(attempt=attempt, stage='cross', elapsed_ms=900)
        session = Session.objects.create(user=ana, name='s')
        AuthToken.issue(ana)
        GoogleIdentity.objects.create(user=ana, sub='g' * 255, email='ana@gmail.com')
        pages = [
            '/admin/', '/admin/accounts/user/', '/admin/accounts/user/add/', f'/admin/accounts/user/{ana.pk}/change/',
            '/admin/accounts/authtoken/', '/admin/accounts/googleidentity/',
            '/admin/timer/solve/', f'/admin/timer/solve/{solve.pk}/change/', '/admin/timer/attempt/', f'/admin/timer/attempt/{attempt.pk}/change/',
            '/admin/timer/session/', f'/admin/timer/session/{session.pk}/change/',
        ]
        for url in pages:
            self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_se_puede_crear_y_editar_un_usuario_desde_el_admin(self):
        # No basta con que las páginas carguen: hay que ENVIAR los formularios (los de Django vienen atados al modelo estándar).
        admin = User.objects.create_superuser('admin', 'admin@example.com', 'x-clave-larga-1')
        self.client.force_login(admin)
        data = {'username': 'nueva', 'email': 'Nueva@Example.com', 'display_name': 'Nueva', 'password1': 'una-clave-larga-9137', 'password2': 'una-clave-larga-9137'}
        self.assertEqual(self.client.post('/admin/accounts/user/add/', data).status_code, 302)
        nueva = User.objects.get(username='nueva')
        self.assertEqual((nueva.email, nueva.display_name), ('nueva@example.com', 'Nueva'), 'el correo se normaliza también desde el admin')
        self.assertTrue(nueva.check_password('una-clave-larga-9137'))
        # Un correo repetido (aunque cambien las mayúsculas) no pasa.
        self.assertEqual(self.client.post('/admin/accounts/user/add/', dict(data, username='otra', email='NUEVA@example.com')).status_code, 200)
        self.assertFalse(User.objects.filter(username='otra').exists())
        # Editar.
        change = {'username': 'nueva', 'display_name': 'Nueva Editada', 'email': 'nueva@example.com', 'is_active': 'on', 'date_joined_0': '2026-11-01', 'date_joined_1': '10:00:00'}
        self.assertEqual(self.client.post(f'/admin/accounts/user/{nueva.pk}/change/', change).status_code, 302)
        nueva.refresh_from_db()
        self.assertEqual(nueva.display_name, 'Nueva Editada')
        self.assertFalse(nueva.is_staff)

    def test_el_admin_muestra_las_horas_de_inicio_deducidas_sin_guardarlas(self):
        admin = User.objects.create_superuser('admin', 'admin@example.com', 'x-clave-larga-1')
        self.client.force_login(admin)
        solve = Solve.objects.create(user=admin, time_ms=30000, inspection_ms=9000, ended_at=timezone.now())
        page = self.client.get(f'/admin/timer/solve/{solve.pk}/change/').content.decode()
        self.assertIn('Inicio de inspección', page)
        self.assertIn('Inicio de ejecución', page)


class GoogleIdentityRules(TestCase):
    def setUp(self):
        self.ana = User.objects.create_user('ana', 'ana@example.com', 'x-clave-larga-1')
        self.beto = User.objects.create_user('beto', 'beto@example.com', 'x-clave-larga-1')

    def test_una_cuenta_tiene_como_maximo_una_identidad_de_google(self):
        GoogleIdentity.objects.create(user=self.ana, sub='g1')
        with self.assertRaises(IntegrityError), transaction.atomic():
            GoogleIdentity.objects.create(user=self.ana, sub='g2')

    def test_una_identidad_de_google_no_puede_estar_en_dos_cuentas(self):
        GoogleIdentity.objects.create(user=self.ana, sub='g1')
        with self.assertRaises(IntegrityError), transaction.atomic():
            GoogleIdentity.objects.create(user=self.beto, sub='g1')

    def test_el_identificador_de_google_admite_255_caracteres(self):
        GoogleIdentity.objects.create(user=self.ana, sub='x' * 255)
        self.assertEqual(len(GoogleIdentity.objects.get().sub), 255)

    def test_borrar_el_usuario_borra_su_identidad_y_sus_sesiones_de_acceso(self):
        GoogleIdentity.objects.create(user=self.ana, sub='g1')
        AuthToken.issue(self.ana)
        self.ana.delete()
        self.assertEqual((GoogleIdentity.objects.count(), AuthToken.objects.count()), (0, 0))