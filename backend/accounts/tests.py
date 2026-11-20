import re
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from timer.models import Solve

from .models import AuthToken, GoogleIdentity, Profile, hash_key

User = get_user_model()
GOOD = 'una-clave-larga-9137'


class BaseCase(APITestCase):
    def setUp(self):
        cache.clear()  # el límite de intentos usa la caché y no debe arrastrarse entre pruebas

    def register(self, username='ana', email='ana@example.com', password=GOOD, **extra):
        return self.client.post('/api/auth/register/', {'username': username, 'email': email, 'password': password, **extra}, format='json')

    def login(self, identifier='ana', password=GOOD):
        return self.client.post('/api/auth/login/', {'identifier': identifier, 'password': password}, format='json')

    def bearer(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

    def make_user(self, username='ana', email='ana@example.com', password=GOOD):
        user = User.objects.create_user(username, email, password)
        Profile.objects.create(user=user, email_key=email.lower())
        return user


class RegistrationTests(BaseCase):
    def test_registro_correcto_devuelve_sesion_y_no_filtra_la_contrasena(self):
        r = self.register(display_name='Ana C.')
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(body['user']['username'], 'ana')
        self.assertEqual(body['user']['display_name'], 'Ana C.')
        self.assertEqual(body['user']['providers'], ['password'])
        self.assertNotIn(GOOD, str(body))  # la contraseña escrita no vuelve en la respuesta
        self.assertNotIn('password', body['user'])  # ni existe un campo con ella
        self.bearer(body['token'])
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)
        self.assertEqual(self.client.get('/api/sync/').status_code, 200)

    def test_el_token_no_se_guarda_en_claro(self):
        token = self.register().json()['token']
        self.assertFalse(AuthToken.objects.filter(key_hash=token).exists())
        self.assertTrue(AuthToken.objects.filter(key_hash=hash_key(token)).exists())

    def test_no_se_repiten_usuarios_ni_correos_sin_importar_mayusculas(self):
        self.assertEqual(self.register().status_code, 201)
        r = self.register(username='ANA', email='otro@example.com')
        self.assertEqual(r.status_code, 400)
        self.assertIn('username', r.json())
        r = self.register(username='ana2', email='ANA@Example.COM')
        self.assertEqual(r.status_code, 400)
        self.assertIn('email', r.json())
        self.assertEqual(User.objects.count(), 1)

    def test_validaciones(self):
        for payload, campo in [
            ({'username': 'a', 'email': 'a@example.com', 'password': GOOD}, 'username'),
            ({'username': 'con espacio', 'email': 'a@example.com', 'password': GOOD}, 'username'),
            ({'username': 'ana', 'email': 'no-es-correo', 'password': GOOD}, 'email'),
            ({'username': 'ana', 'email': 'a@example.com', 'password': '123'}, 'non_field_errors'),
            ({'username': 'ana', 'email': 'a@example.com', 'password': 'password'}, 'non_field_errors'),
        ]:
            r = self.client.post('/api/auth/register/', payload, format='json')
            self.assertEqual(r.status_code, 400, payload)
            self.assertIn(campo, r.json(), payload)
        self.assertEqual(User.objects.count(), 0)

    def test_el_correo_se_guarda_normalizado(self):
        self.register(email='  Ana@Example.COM ')
        self.assertEqual(Profile.objects.get().email_key, 'ana@example.com')


class SessionTests(BaseCase):
    def test_inicio_de_sesion_con_usuario_o_correo(self):
        self.register()
        self.assertEqual(self.login('ana').status_code, 200)
        self.assertEqual(self.login('ANA').status_code, 200)
        self.assertEqual(self.login('Ana@Example.com').status_code, 200)

    def test_error_generico_sin_revelar_si_el_usuario_existe(self):
        self.register()
        a = self.login('ana', 'mala-contrasena')
        b = self.login('no-existe', 'mala-contrasena')
        self.assertEqual((a.status_code, b.status_code), (400, 400))
        self.assertEqual(a.json(), b.json())

    def test_cuenta_desactivada_no_entra(self):
        self.register()
        User.objects.update(is_active=False)
        self.assertEqual(self.login().status_code, 400)

    def test_cada_dispositivo_tiene_su_sesion_y_cerrar_una_no_cierra_las_demas(self):
        self.register()
        t1, t2 = self.login().json()['token'], self.login().json()['token']
        self.assertNotEqual(t1, t2)
        self.bearer(t1)
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)  # t1 ya no sirve
        self.bearer(t2)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)  # t2 sigue

    def test_sin_sesion_no_se_accede_a_nada_personal(self):
        for method, url in [('get', '/api/auth/me/'), ('get', '/api/sync/'), ('post', '/api/sync/'), ('post', '/api/auth/logout/'), ('post', '/api/auth/password/change/')]:
            self.assertEqual(getattr(self.client, method)(url).status_code, 401, url)

    def test_una_sesion_caducada_se_rechaza_y_se_elimina(self):
        token = self.register().json()['token']
        AuthToken.objects.update(created_at=timezone.now() - timedelta(days=31))
        self.bearer(token)
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(AuthToken.objects.count(), 0)

    def test_limite_de_intentos_frena_la_fuerza_bruta(self):
        self.register()
        codigos = [self.login('ana', 'mala').status_code for _ in range(33)]
        self.assertIn(429, codigos)
        self.assertEqual(codigos[0], 400)


class ProfileTests(BaseCase):
    def setUp(self):
        super().setUp()
        self.token = self.register().json()['token']
        self.bearer(self.token)

    def test_ver_y_editar_el_nombre_visible(self):
        self.assertEqual(self.client.get('/api/auth/me/').json()['display_name'], 'ana')
        r = self.client.patch('/api/auth/me/', {'display_name': '  Ana Cubo '}, format='json')
        self.assertEqual(r.json()['display_name'], 'Ana Cubo')
        self.assertEqual(self.client.patch('/api/auth/me/', {'display_name': 'x' * 61}, format='json').status_code, 400)

    def test_cada_cuenta_ve_solo_su_perfil(self):
        otro = self.make_user('beto', 'beto@example.com')
        _, raw = AuthToken.issue(otro)
        self.bearer(raw)
        self.assertEqual(self.client.get('/api/auth/me/').json()['username'], 'beto')

    def test_cambiar_la_contrasena_exige_la_actual_y_cierra_las_demas_sesiones(self):
        otra = self.login().json()['token']
        r = self.client.post('/api/auth/password/change/', {'old_password': 'incorrecta', 'new_password': 'otra-clave-larga-5521'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/api/auth/password/change/', {'old_password': GOOD, 'new_password': 'otra-clave-larga-5521'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)  # esta sesión sigue
        self.bearer(otra)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)  # la otra se cerró
        self.client.credentials()
        self.assertEqual(self.login('ana', 'otra-clave-larga-5521').status_code, 200)
        self.assertEqual(self.login('ana', GOOD).status_code, 400)

    def test_una_contrasena_nueva_debe_ser_valida(self):
        r = self.client.post('/api/auth/password/change/', {'old_password': GOOD, 'new_password': '123'}, format='json')
        self.assertEqual(r.status_code, 400)


class PasswordResetTests(BaseCase):
    def setUp(self):
        super().setUp()
        self.register()

    def link_params(self):
        body = mail.outbox[-1].body
        m = re.search(r'#/reset\?uid=([^&\s]+)&token=([^\s]+)', body)
        self.assertIsNotNone(m, body)
        return m.group(1), m.group(2)

    def test_la_respuesta_es_la_misma_exista_o_no_la_cuenta(self):
        a = self.client.post('/api/auth/password-reset/', {'email': 'ana@example.com'}, format='json')
        b = self.client.post('/api/auth/password-reset/', {'email': 'nadie@example.com'}, format='json')
        self.assertEqual((a.status_code, b.status_code), (200, 200))
        self.assertEqual(a.json(), b.json())
        self.assertEqual(len(mail.outbox), 1)  # solo se envió a la cuenta real

    def test_flujo_completo_y_el_enlace_sirve_una_sola_vez(self):
        old_token = self.login().json()['token']
        self.client.post('/api/auth/password-reset/', {'email': 'ANA@example.com'}, format='json')
        uid, token = self.link_params()
        r = self.client.post('/api/auth/password-reset/confirm/', {'uid': uid, 'token': token, 'password': 'clave-nueva-largo-4410'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.login('ana', 'clave-nueva-largo-4410').status_code, 200)
        self.bearer(old_token)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)  # las sesiones anteriores se cerraron
        self.client.credentials()
        r = self.client.post('/api/auth/password-reset/confirm/', {'uid': uid, 'token': token, 'password': 'otra-mas-larga-7788'}, format='json')
        self.assertEqual(r.status_code, 400)  # el enlace ya no vale

    def test_enlaces_invalidos_y_contrasenas_debiles(self):
        self.client.post('/api/auth/password-reset/', {'email': 'ana@example.com'}, format='json')
        uid, token = self.link_params()
        for payload in [{'uid': uid, 'token': 'falso', 'password': 'clave-nueva-largo-4410'}, {'uid': 'zzz', 'token': token, 'password': 'clave-nueva-largo-4410'}]:
            self.assertEqual(self.client.post('/api/auth/password-reset/confirm/', payload, format='json').status_code, 400)
        r = self.client.post('/api/auth/password-reset/confirm/', {'uid': uid, 'token': token, 'password': '123'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.login().status_code, 200)  # la contraseña no cambió


def google_info(sub='g-1', email='gina@example.com', verified=True, name='Gina G.'):
    return {'sub': sub, 'email': email, 'email_verified': verified, 'name': name}


@override_settings(GOOGLE_CLIENT_ID='cliente-de-prueba')
class GoogleTests(BaseCase):
    def google(self, info=None, url='/api/auth/google/', error=None):
        target = 'accounts.google.verify_google_credential'
        with mock.patch(target, side_effect=error) if error else mock.patch(target, return_value=info or google_info()):
            return self.client.post(url, {'credential': 'token-de-google'}, format='json')

    def test_crea_la_cuenta_la_primera_vez_y_entra_con_la_misma_despues(self):
        r = self.google()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['user']['providers'], ['google'])
        self.assertEqual(r.json()['user']['display_name'], 'Gina G.')
        r2 = self.google()
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()['user']['id'], r.json()['user']['id'])
        self.assertEqual(User.objects.count(), 1)
        self.assertFalse(User.objects.get().has_usable_password())

    def test_un_correo_ya_registrado_con_contrasena_no_se_vincula_en_silencio(self):
        self.register(username='gina', email='gina@example.com')
        r = self.google()
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'link_required')
        self.assertEqual(User.objects.count(), 1)  # sin duplicados
        self.assertEqual(GoogleIdentity.objects.count(), 0)  # y sin vincular

    def test_vinculacion_explicita_desde_la_sesion_y_luego_entra_con_google(self):
        token = self.register(username='gina', email='gina@example.com').json()['token']
        self.bearer(token)
        r = self.google(url='/api/auth/google/link/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sorted(r.json()['providers']), ['google', 'password'])
        self.client.credentials()
        entrada = self.google()
        self.assertEqual(entrada.status_code, 200)
        self.assertEqual(entrada.json()['user']['username'], 'gina')
        self.assertEqual(User.objects.count(), 1)

    def test_una_identidad_de_google_no_puede_vincularse_a_dos_cuentas(self):
        self.google()  # la identidad g-1 pertenece a la cuenta creada con Google
        otro = self.register(username='otro', email='otro@example.com').json()['token']
        self.bearer(otro)
        r = self.google(url='/api/auth/google/link/')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'google_taken')

    def test_credenciales_no_validas(self):
        self.assertEqual(self.google(info=google_info(verified=False)).json()['code'], 'google_email_unverified')
        self.assertEqual(self.google(error=ValueError('mala firma')).json()['code'], 'google_invalid')
        self.assertEqual(User.objects.count(), 0)

    def test_desvincular_exige_otra_forma_de_entrar(self):
        self.google()  # cuenta solo con Google
        _, raw = AuthToken.issue(User.objects.get())
        self.bearer(raw)
        self.assertEqual(self.client.post('/api/auth/google/unlink/').json()['code'], 'password_required')
        self.assertEqual(GoogleIdentity.objects.count(), 1)
        user = User.objects.get()
        user.set_password(GOOD)
        user.save()
        self.assertEqual(self.client.post('/api/auth/google/unlink/').status_code, 200)
        self.assertEqual(GoogleIdentity.objects.count(), 0)

    @override_settings(GOOGLE_CLIENT_ID='')
    def test_sin_configurar_google_responde_501(self):
        r = self.client.post('/api/auth/google/', {'credential': 'x'}, format='json')
        self.assertEqual(r.status_code, 501)
        self.assertEqual(r.json()['code'], 'google_not_configured')


class OwnershipTests(BaseCase):
    def test_una_cuenta_no_ve_ni_modifica_lo_de_otra(self):
        a = self.register(username='ana', email='ana@example.com').json()['token']
        b = self.register(username='beto', email='beto@example.com').json()['token']
        solve = {'id': '33333333-3333-4333-8333-333333333333', 'session': None, 'puzzle': '3x3', 'time_ms': 9000, 'penalty': None,
                 'scramble': 'R', 'solved_at': '2026-11-01T10:00:00Z', 'deleted_at': None}
        self.bearer(a)
        self.client.post('/api/sync/', {'solves': [solve]}, format='json')
        self.bearer(b)
        self.assertEqual(self.client.get('/api/sync/').json()['solves'], [])
        r = self.client.post('/api/sync/', {'solves': [dict(solve, time_ms=1)]}, format='json')
        self.assertIn(solve['id'], r.json()['rejected']['solves'])
        self.assertEqual(Solve.objects.get().time_ms, 9000)
        self.assertEqual(Solve.objects.get().user.username, 'ana')