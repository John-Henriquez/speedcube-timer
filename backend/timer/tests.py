import uuid

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Session, Solve

User = get_user_model()


def solve_payload(**overrides):
    data = {
        'id': str(uuid.uuid4()),
        'session': None,
        'puzzle': '3x3',
        'time_ms': 12340,
        'penalty': None,
        'scramble': "R U R' U'",
        'solved_at': '2026-10-21T20:00:00Z',
        'deleted_at': None,
    }
    data.update(overrides)
    return data


class ApiTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('john', password='pw-segura-123')
        self.other = User.objects.create_user('otra', password='pw-segura-123')
        self.auth(self.user)

    def auth(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def push(self, **body):
        return self.client.post('/api/sync/', body, format='json')


class AccessTests(ApiTestCase):
    def test_health_no_requiere_autenticacion(self):
        self.client.credentials()
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_sync_requiere_autenticacion(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/sync/').status_code, 401)
        self.assertEqual(self.client.post('/api/sync/', {}, format='json').status_code, 401)

    def test_obtener_token(self):
        self.client.credentials()
        response = self.client.post(
            '/api/auth/token/', {'username': 'john', 'password': 'pw-segura-123'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.json())


class SyncTests(ApiTestCase):
    def test_subir_y_bajar(self):
        session_id = str(uuid.uuid4())
        solve = solve_payload(session=session_id, penalty='+2')
        response = self.push(sessions=[{'id': session_id, 'name': 'Práctica', 'puzzle': '3x3'}], solves=[solve])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['solves'], 1)

        data = self.client.get('/api/sync/').json()
        self.assertEqual(len(data['sessions']), 1)
        self.assertEqual(len(data['solves']), 1)
        self.assertEqual(data['solves'][0]['id'], solve['id'])
        self.assertEqual(data['solves'][0]['session'], session_id)
        self.assertEqual(data['solves'][0]['penalty'], '+2')

    def test_subir_dos_veces_no_duplica(self):
        solve = solve_payload()
        self.push(solves=[solve])
        self.push(solves=[solve])
        self.assertEqual(Solve.objects.count(), 1)

    def test_actualizar_y_borrado_logico_llegan_en_since(self):
        solve = solve_payload()
        self.push(solves=[solve])
        server_time = self.client.get('/api/sync/').json()['server_time']

        solve.update(penalty='DNF', deleted_at='2026-10-22T10:00:00Z')
        self.push(solves=[solve])

        changes = self.client.get('/api/sync/', {'since': server_time}).json()
        self.assertEqual(len(changes['solves']), 1)
        self.assertEqual(changes['solves'][0]['penalty'], 'DNF')
        self.assertIsNotNone(changes['solves'][0]['deleted_at'])
        self.assertEqual(Solve.objects.count(), 1)  # el borrado es lógico

    def test_since_filtra_lo_ya_sincronizado(self):
        self.push(solves=[solve_payload()])
        server_time = self.client.get('/api/sync/').json()['server_time']
        changes = self.client.get('/api/sync/', {'since': server_time}).json()
        self.assertEqual(changes['solves'], [])

    def test_since_invalido(self):
        self.assertEqual(self.client.get('/api/sync/', {'since': 'ayer'}).status_code, 400)

    def test_penalizacion_invalida(self):
        response = self.push(solves=[solve_payload(penalty='+5')])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Solve.objects.count(), 0)

    def test_tiempo_invalido(self):
        self.assertEqual(self.push(solves=[solve_payload(time_ms=-1)]).status_code, 400)

    def test_lote_con_error_no_guarda_nada(self):
        buena = solve_payload()
        mala = solve_payload(time_ms=-5)
        self.assertEqual(self.push(solves=[buena, mala]).status_code, 400)
        self.assertEqual(Solve.objects.count(), 0)

    def test_formato_invalido(self):
        self.assertEqual(self.push(solves='hola').status_code, 400)


class IsolationTests(ApiTestCase):
    def test_cada_usuario_ve_solo_lo_suyo(self):
        self.push(solves=[solve_payload()])
        self.auth(self.other)
        data = self.client.get('/api/sync/').json()
        self.assertEqual(data['solves'], [])

    def test_no_se_puede_pisar_el_id_de_otro_usuario(self):
        solve = solve_payload()
        self.push(solves=[solve])
        self.auth(self.other)
        response = self.push(solves=[solve_payload(id=solve['id'], time_ms=1)])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Solve.objects.get(pk=solve['id']).time_ms, 12340)

    def test_sesion_de_otro_usuario_es_rechazada(self):
        ajena = Session.objects.create(user=self.other, name='Ajena')
        response = self.push(solves=[solve_payload(session=str(ajena.id))])
        self.assertEqual(response.status_code, 400)
