"""
Reglas de integridad GARANTIZADAS POR LA BASE DE DATOS. Estas pruebas escriben directamente con el ORM, sin pasar por los
serializadores, para demostrar que el esquema se defiende solo (API, admin o shell dan igual).
"""
import uuid

from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from accounts.models import User

from .models import MAX_TIME_MS, Attempt, AttemptMark, Session, Solve, SolveMark

NOW = timezone.now()


def make_solve(user, **kw):
    return Solve.objects.create(user=user, time_ms=kw.pop('time_ms', 12000), ended_at=kw.pop('ended_at', NOW), **kw)


def make_attempt(user, **kw):
    kw.setdefault('time_ms', 1800)
    return Attempt.objects.create(user=user, zone=kw.pop('zone', 'oll'), ended_at=kw.pop('ended_at', NOW), **kw)


class RejectsInvalidData(TestCase):
    """Cada caso debe fallar en la base de datos aunque nadie valide antes."""

    def setUp(self):
        self.user = User.objects.create_user('ana', 'ana@example.com', 'pw-segura-123')

    def assertRejected(self, fn):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                fn()

    def test_penalizacion_desconocida(self):
        self.assertRejected(lambda: make_solve(self.user, penalty='+5'))
        make_solve(self.user, penalty='+2')
        make_solve(self.user, penalty='DNF')
        make_solve(self.user, penalty=None)

    def test_tiempos_fuera_de_rango(self):
        self.assertRejected(lambda: make_solve(self.user, time_ms=MAX_TIME_MS + 1))
        self.assertRejected(lambda: make_solve(self.user, inspection_ms=MAX_TIME_MS + 1))
        self.assertRejected(lambda: make_attempt(self.user, time_ms=MAX_TIME_MS + 1))
        make_solve(self.user, time_ms=MAX_TIME_MS, inspection_ms=0)

    def test_valores_de_intento_fuera_de_los_permitidos(self):
        self.assertRejected(lambda: make_attempt(self.user, mode='rapido'))
        self.assertRejected(lambda: make_attempt(self.user, capture='magia'))
        self.assertRejected(lambda: make_attempt(self.user, validation='quizas'))

    def test_ejecucion_sin_tiempo_no_existe_pero_conocimiento_si(self):
        self.assertRejected(lambda: make_attempt(self.user, mode='ejecucion', time_ms=None))
        make_attempt(self.user, mode='conocimiento', time_ms=None)

    def test_el_algoritmo_usado_conserva_su_notacion(self):
        self.assertRejected(lambda: make_attempt(self.user, algorithm_ref='oll-27#1', algorithm_notation=None))
        make_attempt(self.user, algorithm_ref='oll-27#1', algorithm_notation="R U R'")
        make_attempt(self.user, algorithm_ref=None, algorithm_notation="R U R'")  # algoritmo propio, sin id del catálogo
        make_attempt(self.user)

    def test_una_etapa_no_puede_tener_dos_marcas(self):
        solve, attempt = make_solve(self.user), make_attempt(self.user)
        SolveMark.objects.create(solve=solve, stage='cross', elapsed_ms=4000)
        self.assertRejected(lambda: SolveMark.objects.create(solve=solve, stage='cross', elapsed_ms=5000))
        AttemptMark.objects.create(attempt=attempt, stage='cross', elapsed_ms=4000)
        self.assertRejected(lambda: AttemptMark.objects.create(attempt=attempt, stage='cross', elapsed_ms=5000))
        # La misma etapa sí puede repetirse en otra resolución.
        SolveMark.objects.create(solve=make_solve(self.user), stage='cross', elapsed_ms=4000)

    def test_marcas_fuera_de_rango(self):
        solve = make_solve(self.user)
        self.assertRejected(lambda: SolveMark.objects.create(solve=solve, stage='cross', elapsed_ms=MAX_TIME_MS + 1))

    def test_un_id_no_puede_repetirse(self):
        solve = make_solve(self.user)
        self.assertRejected(lambda: Solve.objects.create(id=solve.id, user=self.user, time_ms=1, ended_at=NOW))


class RelationsAndDeletion(TestCase):
    def setUp(self):
        self.ana = User.objects.create_user('ana', 'ana@example.com', 'pw-segura-123')
        self.beto = User.objects.create_user('beto', 'beto@example.com', 'pw-segura-123')

    def test_borrar_una_resolucion_borra_sus_marcas(self):
        solve = make_solve(self.ana)
        SolveMark.objects.create(solve=solve, stage='cross', elapsed_ms=4000)
        solve.delete()
        self.assertEqual(SolveMark.objects.count(), 0)

    def test_borrar_un_usuario_borra_todo_lo_suyo_y_nada_de_los_demas(self):
        for user in (self.ana, self.beto):
            session = Session.objects.create(user=user, name='s')
            solve = make_solve(user, session=session)
            SolveMark.objects.create(solve=solve, stage='cross', elapsed_ms=1)
            attempt = make_attempt(user)
            AttemptMark.objects.create(attempt=attempt, stage='cross', elapsed_ms=1)
        self.ana.delete()
        self.assertEqual([Session.objects.count(), Solve.objects.count(), Attempt.objects.count(), SolveMark.objects.count(), AttemptMark.objects.count()], [1, 1, 1, 1, 1])
        self.assertEqual(Solve.objects.get().user, self.beto)

    def test_borrar_una_sesion_no_borra_las_resoluciones(self):
        session = Session.objects.create(user=self.ana, name='s')
        solve = make_solve(self.ana, session=session)
        session.delete()
        solve.refresh_from_db()
        self.assertIsNone(solve.session)

    def test_el_intento_no_depende_de_una_resolucion_ni_de_una_sesion(self):
        make_attempt(self.ana)  # existe sin ninguna resolución ni sesión
        self.assertEqual(Attempt.objects.count(), 1)
        self.assertFalse(hasattr(Attempt, 'session'))

    def test_el_tiempo_efectivo_se_calcula_no_se_guarda(self):
        self.assertEqual(make_solve(self.ana, time_ms=10000).effective_time_ms, 10000)
        self.assertEqual(make_solve(self.ana, time_ms=10000, penalty='+2').effective_time_ms, 12000)
        self.assertIsNone(make_solve(self.ana, time_ms=10000, penalty='DNF').effective_time_ms)
        self.assertNotIn('effective_time_ms', [f.name for f in Solve._meta.get_fields()])

    def test_las_horas_de_inicio_se_deducen_de_una_sola_marca_absoluta(self):
        # ended_at (única hora absoluta) - time_ms = inicio de ejecución; - inspection_ms = inicio de inspección.
        from datetime import timedelta
        solve = make_solve(self.ana, time_ms=30000, inspection_ms=12000)
        execution_start = solve.ended_at - timedelta(milliseconds=solve.time_ms)
        inspection_start = execution_start - timedelta(milliseconds=solve.inspection_ms)
        self.assertEqual((solve.ended_at - inspection_start).total_seconds(), 42)
        self.assertEqual([f.name for f in Solve._meta.get_fields() if 'start' in f.name], [], 'no se guardan duplicados de la misma duración')


class SameUserSessionGuaranteedByDatabase(TestCase):
    """Clave foránea compuesta (session_id, user_id): solo existe en PostgreSQL, la base real."""

    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('La clave compuesta se crea solo en PostgreSQL (en SQLite lo valida el serializador).')
        self.ana = User.objects.create_user('ana', 'ana@example.com', 'pw-segura-123')
        self.beto = User.objects.create_user('beto', 'beto@example.com', 'pw-segura-123')

    def test_una_resolucion_no_puede_apuntar_a_la_sesion_de_otro_usuario(self):
        sesion_de_beto = Session.objects.create(user=self.beto, name='de beto')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                make_solve(self.ana, session=sesion_de_beto)
                connection.check_constraints()  # la comprobación está diferida: aquí se fuerza

    def test_a_la_sesion_de_su_mismo_usuario_si(self):
        propia = Session.objects.create(user=self.ana, name='mía')
        with transaction.atomic():
            solve = make_solve(self.ana, session=propia)
            connection.check_constraints()
        self.assertEqual(solve.session, propia)

    def test_sin_sesion_no_se_comprueba_nada(self):
        make_solve(self.ana, session=None)
        connection.check_constraints()

    def test_borrar_la_sesion_con_sql_directo_deja_la_resolucion_con_su_usuario(self):
        if connection.pg_version < 150000:
            self.skipTest('ON DELETE SET NULL (columna) requiere PostgreSQL 15 o superior.')
        propia = Session.objects.create(user=self.ana, name='mía')
        solve = make_solve(self.ana, session=propia)
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM timer_session WHERE id = %s', [propia.pk])
        solve.refresh_from_db()
        self.assertIsNone(solve.session_id)
        self.assertEqual(solve.user, self.ana)  # solo se anuló la sesión, no el dueño