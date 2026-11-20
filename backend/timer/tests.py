import uuid

from django.contrib.auth import get_user_model
from accounts.models import AuthToken
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
        _, raw = AuthToken.issue(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {raw}')


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

    def test_un_token_inventado_o_ajeno_no_sirve(self):
        self.client.credentials(HTTP_AUTHORIZATION='Token inventado')
        self.assertEqual(self.client.get('/api/sync/').status_code, 401)

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
        mala = solve_payload(penalty='+5')
        response = self.push(solves=[mala])
        self.assertEqual(response.status_code, 200)
        self.assertIn('penalty', response.json()['rejected']['solves'][mala['id']])
        self.assertEqual(Solve.objects.count(), 0)

    def test_tiempo_invalido(self):
        mala = solve_payload(time_ms=-1)
        self.assertIn(mala['id'], self.push(solves=[mala]).json()['rejected']['solves'])

    def test_un_dato_malo_no_bloquea_a_los_demas(self):
        buena = solve_payload()
        mala = solve_payload(time_ms=-5)
        body = self.push(solves=[buena, mala]).json()
        self.assertEqual(body['accepted']['solves'], [buena['id']])
        self.assertEqual(list(body['rejected']['solves']), [mala['id']])
        self.assertEqual(Solve.objects.count(), 1)  # la buena se guardó

    def test_la_respuesta_dice_que_paso_con_cada_id(self):
        a, b = solve_payload(), solve_payload()
        body = self.push(solves=[a, b]).json()
        self.assertEqual(sorted(body['accepted']['solves']), sorted([a['id'], b['id']]))
        self.assertEqual(body['stale']['solves'], [])
        self.assertEqual(body['solves'], 2)  # el conteo de siempre se mantiene

    def test_una_version_mas_antigua_no_pisa_a_la_mas_reciente(self):
        solve = solve_payload(client_updated_at='2026-11-01T12:00:00Z', time_ms=1000)
        self.push(solves=[solve])
        vieja = dict(solve, client_updated_at='2026-11-01T11:00:00Z', time_ms=9999)
        body = self.push(solves=[vieja]).json()
        self.assertEqual(body['stale']['solves'], [solve['id']])
        self.assertEqual(Solve.objects.get(pk=solve['id']).time_ms, 1000)  # gana la reciente
        nueva = dict(solve, client_updated_at='2026-11-01T13:00:00Z', time_ms=2000)
        self.assertEqual(self.push(solves=[nueva]).json()['accepted']['solves'], [solve['id']])
        self.assertEqual(Solve.objects.get(pk=solve['id']).time_ms, 2000)

    def test_reenviar_lo_mismo_es_idempotente_y_no_es_obsoleto(self):
        solve = solve_payload(client_updated_at='2026-11-01T12:00:00Z')
        self.push(solves=[solve])
        body = self.push(solves=[solve]).json()  # misma hora: se acepta de nuevo, sin duplicar
        self.assertEqual(body['accepted']['solves'], [solve['id']])
        self.assertEqual(Solve.objects.count(), 1)

    def test_un_borrado_mas_antiguo_no_revive_ni_borra_lo_mas_nuevo(self):
        solve = solve_payload(client_updated_at='2026-11-01T12:00:00Z')
        self.push(solves=[solve])
        borrado_viejo = dict(solve, client_updated_at='2026-11-01T10:00:00Z', deleted_at='2026-11-01T10:00:00Z')
        self.assertEqual(self.push(solves=[borrado_viejo]).json()['stale']['solves'], [solve['id']])
        self.assertIsNone(Solve.objects.get(pk=solve['id']).deleted_at)

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
        self.assertIn(solve['id'], response.json()['rejected']['solves'])
        self.assertEqual(Solve.objects.get(pk=solve['id']).time_ms, 12340)
        self.assertEqual(Solve.objects.get(pk=solve['id']).user, self.user)

    def test_el_cliente_no_decide_de_quien_es_un_registro(self):
        # Aunque el cuerpo diga que el dueño es otro usuario, manda la sesión.
        solve = solve_payload(user=self.other.id, user_id=self.other.id)
        self.push(solves=[solve])
        self.assertEqual(Solve.objects.get(pk=solve['id']).user, self.user)
        self.auth(self.other)
        self.assertEqual(self.client.get('/api/sync/').json()['solves'], [])

    def test_sesion_de_otro_usuario_es_rechazada(self):
        ajena = Session.objects.create(user=self.other, name='Ajena')
        mala = solve_payload(session=str(ajena.id))
        response = self.push(solves=[mala])
        self.assertIn(mala['id'], response.json()['rejected']['solves'])
        self.assertEqual(Solve.objects.count(), 0)
