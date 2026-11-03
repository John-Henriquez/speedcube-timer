import uuid

from .models import Attempt
from .tests import ApiTestCase


def attempt_payload(**overrides):
    data = {
        'id': str(uuid.uuid4()),
        'zone': 'oll',
        'case_id': 'oll-sune',
        'mode': 'ejecucion',
        'scramble': "R U2 R' U' R U' R'",
        'algorithm_id': None,
        'algorithm_notation': '',
        'time_ms': 1840,
        'recognition_ms': None,
        'capture': 'manual',
        'validation': 'sin_verificar',
        'moves': None,
        'stage_marks': None,
        'notes': '',
        'protocol_version': 1,
        'attempted_at': '2026-10-22T20:00:00Z',
        'deleted_at': None,
    }
    data.update(overrides)
    return data


class AttemptSyncTests(ApiTestCase):
    def test_subir_y_bajar(self):
        attempt = attempt_payload(validation='valida', stage_marks={'cross': 5200})
        self.assertEqual(self.push(attempts=[attempt]).json()['attempts'], 1)
        data = self.client.get('/api/sync/').json()
        self.assertEqual(len(data['attempts']), 1)
        self.assertEqual(data['attempts'][0]['id'], attempt['id'])
        self.assertEqual(data['attempts'][0]['stage_marks'], {'cross': 5200})
        self.assertIsNone(data['attempts'][0]['moves'])  # lo no medido no se inventa

    def test_idempotente_y_actualiza(self):
        attempt = attempt_payload()
        self.push(attempts=[attempt])
        attempt['validation'] = 'invalida'
        self.push(attempts=[attempt])
        self.assertEqual(Attempt.objects.count(), 1)
        self.assertEqual(Attempt.objects.get().validation, 'invalida')

    def test_ejecucion_exige_tiempo_pero_conocimiento_no(self):
        self.assertEqual(self.push(attempts=[attempt_payload(time_ms=None)]).status_code, 400)
        ok = attempt_payload(mode='conocimiento', time_ms=None, validation='valida')
        self.assertEqual(self.push(attempts=[ok]).status_code, 200)

    def test_valores_invalidos(self):
        for field, value in [('mode', 'rapido'), ('capture', 'magia'), ('validation', 'quizas'), ('time_ms', -1)]:
            self.assertEqual(self.push(attempts=[attempt_payload(**{field: value})]).status_code, 400, field)
        self.assertEqual(Attempt.objects.count(), 0)

    def test_borrado_logico_llega_en_since(self):
        attempt = attempt_payload()
        self.push(attempts=[attempt])
        server_time = self.client.get('/api/sync/').json()['server_time']
        attempt['deleted_at'] = '2026-10-23T10:00:00Z'
        self.push(attempts=[attempt])
        changes = self.client.get('/api/sync/', {'since': server_time}).json()
        self.assertEqual(len(changes['attempts']), 1)
        self.assertIsNotNone(changes['attempts'][0]['deleted_at'])

    def test_aislamiento_entre_usuarios(self):
        attempt = attempt_payload()
        self.push(attempts=[attempt])
        self.auth(self.other)
        self.assertEqual(self.client.get('/api/sync/').json()['attempts'], [])
        self.assertEqual(self.push(attempts=[attempt_payload(id=attempt['id'], time_ms=1)]).status_code, 403)
        self.assertEqual(Attempt.objects.get(pk=attempt['id']).time_ms, 1840)

    def test_el_envio_sin_intentos_sigue_funcionando(self):
        self.assertEqual(self.push(solves=[]).status_code, 200)

class AttemptAlgorithmTests(ApiTestCase):
    def test_guarda_el_algoritmo_usado_tal_cual(self):
        attempt = attempt_payload(zone='oll', case_id='oll-27', algorithm_id='oll-27#1', algorithm_notation="R U R' U R U2 R'")
        self.push(attempts=[attempt])
        row = Attempt.objects.get(pk=attempt['id'])
        self.assertEqual(row.algorithm_id, 'oll-27#1')
        self.assertEqual(row.algorithm_notation, "R U R' U R U2 R'")
        data = self.client.get('/api/sync/').json()['attempts'][0]
        self.assertEqual(data['algorithm_notation'], "R U R' U R U2 R'")

    def test_el_algoritmo_es_opcional(self):
        self.assertEqual(self.push(attempts=[attempt_payload()]).status_code, 200)
        self.assertIsNone(Attempt.objects.get().algorithm_id)

    def test_reenviar_el_intento_no_cambia_el_algoritmo_guardado(self):
        attempt = attempt_payload(algorithm_id='pll-ua#2', algorithm_notation="M2 U M U2 M' U M2")
        self.push(attempts=[attempt])
        attempt['validation'] = 'invalida'  # se edita el estado; el algoritmo viaja igual
        self.push(attempts=[attempt])
        self.assertEqual(Attempt.objects.get().algorithm_notation, "M2 U M U2 M' U M2")
