"""El admin permite crear y corregir datos, y las reglas de la base se ven como errores de formulario (no como un 500)."""
from django.test import TestCase

from accounts.models import User

from .models import Attempt, AttemptMark, Solve, SolveMark


class AdminForms(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'admin@example.com', 'x-clave-larga-1')
        self.client.force_login(self.admin)

    def solve_data(self, **extra):
        return {
            'user': self.admin.pk, 'puzzle': '3x3', 'time_ms': 30000, 'scramble': 'R U', 'ended_at_0': '2026-11-01', 'ended_at_1': '10:00:00',
            'client_updated_at_0': '2026-11-01', 'client_updated_at_1': '10:00:00',
            'marks-TOTAL_FORMS': '1', 'marks-INITIAL_FORMS': '0', 'marks-MIN_NUM_FORMS': '0', 'marks-MAX_NUM_FORMS': '1000',
            'marks-0-stage': 'cross', 'marks-0-elapsed_ms': '4000', **extra,
        }

    def test_crear_una_resolucion_con_inspeccion_y_marcas(self):
        response = self.client.post('/admin/timer/solve/add/', self.solve_data(inspection_ms='8000'))
        self.assertEqual(response.status_code, 302)
        solve = Solve.objects.get()
        self.assertEqual((solve.time_ms, solve.inspection_ms), (30000, 8000))
        self.assertEqual([(m.stage, m.elapsed_ms) for m in SolveMark.objects.filter(solve=solve)], [('cross', 4000)])

    def test_una_marca_repetida_se_ve_como_error_de_formulario(self):
        data = self.solve_data()
        data.update({'marks-TOTAL_FORMS': '2', 'marks-1-stage': 'cross', 'marks-1-elapsed_ms': '5000'})
        response = self.client.post('/admin/timer/solve/add/', data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Solve.objects.count(), 0)

    def attempt_data(self, **extra):
        return {
            'user': self.admin.pk, 'zone': 'oll', 'mode': 'ejecucion', 'capture': 'manual', 'validation': 'sin_verificar', 'protocol_version': '1',
            'ended_at_0': '2026-11-01', 'ended_at_1': '10:00:00', 'client_updated_at_0': '2026-11-01', 'client_updated_at_1': '10:00:00',
            'marks-TOTAL_FORMS': '0', 'marks-INITIAL_FORMS': '0', 'marks-MIN_NUM_FORMS': '0', 'marks-MAX_NUM_FORMS': '1000', **extra,
        }

    def test_un_intento_de_ejecucion_sin_tiempo_es_un_error_de_formulario_no_un_500(self):
        response = self.client.post('/admin/timer/attempt/add/', self.attempt_data())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Attempt.objects.count(), 0)

    def test_un_intento_de_conocimiento_sin_tiempo_se_puede_crear(self):
        response = self.client.post('/admin/timer/attempt/add/', self.attempt_data(mode='conocimiento'))
        self.assertEqual(response.status_code, 302)
        self.assertIsNone(Attempt.objects.get().time_ms)