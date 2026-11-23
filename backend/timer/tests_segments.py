"""Resoluciones segmentadas, inspección e intentos independientes, a través de la API de sincronización."""
import uuid
from unittest import mock

from django.db import IntegrityError

from .models import Attempt, AttemptMark, Solve, SolveMark
from .tests import ApiTestCase, solve_payload
from .tests_attempts import attempt_payload

CFOP = [{'stage': 'cross', 'elapsed_ms': 4100}, {'stage': 'f2l', 'elapsed_ms': 21000}, {'stage': 'oll', 'elapsed_ms': 29000}]


def rejected(response, kind, item):
    return response.json()['rejected'][kind].get(item['id'])


class SegmentedSolves(ApiTestCase):
    def test_resolucion_completa_segmentada_con_inspeccion(self):
        solve = solve_payload(time_ms=33000, inspection_ms=8500, marks=CFOP)
        self.assertEqual(self.push(solves=[solve]).json()['accepted']['solves'], [solve['id']])
        row = Solve.objects.get()
        self.assertEqual((row.time_ms, row.inspection_ms), (33000, 8500))
        self.assertEqual([(m.stage, m.elapsed_ms) for m in row.marks.all()], [('cross', 4100), ('f2l', 21000), ('oll', 29000)])
        out = self.client.get('/api/sync/').json()['solves'][0]
        self.assertEqual(out['inspection_ms'], 8500)
        self.assertEqual(out['marks'], CFOP, 'las marcas vuelven ordenadas por instante')

    def test_la_ultima_etapa_no_se_guarda_se_deduce_del_tiempo_total(self):
        # PLL termina cuando termina la ejecución: su duración es time_ms - marca de OLL.
        self.push(solves=[solve_payload(time_ms=33000, marks=CFOP)])
        stages = set(SolveMark.objects.values_list('stage', flat=True))
        self.assertNotIn('pll', stages)
        self.assertEqual(Solve.objects.get().time_ms - SolveMark.objects.get(stage='oll').elapsed_ms, 4000)

    def test_resolucion_completa_sin_segmentacion_ni_inspeccion(self):
        solve = solve_payload()
        self.push(solves=[solve])
        out = self.client.get('/api/sync/').json()['solves'][0]
        self.assertIsNone(out['inspection_ms'])
        self.assertEqual(out['marks'], [])

    def test_registro_parcial_con_algunas_marcas(self):
        parcial = solve_payload(time_ms=33000, marks=[{'stage': 'cross', 'elapsed_ms': 4100}])
        self.assertEqual(self.push(solves=[parcial]).json()['accepted']['solves'], [parcial['id']])
        self.assertEqual(SolveMark.objects.count(), 1)

    def test_las_etapas_dependen_de_la_modalidad_y_no_estan_fijas_en_el_esquema(self):
        roux = solve_payload(time_ms=40000, marks=[{'stage': 'first-block', 'elapsed_ms': 8000}, {'stage': 'cmll', 'elapsed_ms': 25000}])
        self.assertEqual(self.push(solves=[roux]).json()['accepted']['solves'], [roux['id']])

    def test_reenviar_no_duplica_y_reemplaza_el_conjunto_de_marcas(self):
        solve = solve_payload(time_ms=33000, marks=CFOP)
        self.push(solves=[solve])
        self.push(solves=[solve])
        self.assertEqual(SolveMark.objects.count(), 3, 'reenviar lo mismo no duplica marcas')
        solve['marks'] = [{'stage': 'cross', 'elapsed_ms': 3900}]
        self.push(solves=[solve])
        self.assertEqual([(m.stage, m.elapsed_ms) for m in SolveMark.objects.all()], [('cross', 3900)], 'el conjunto se reemplaza')

    def test_sin_el_campo_marks_las_marcas_existentes_no_se_tocan(self):
        solve = solve_payload(time_ms=33000, marks=CFOP)
        self.push(solves=[solve])
        sin_marcas = {k: v for k, v in solve.items() if k != 'marks'}
        sin_marcas['penalty'] = '+2'  # un cliente que no conoce las marcas edita la penalización
        self.push(solves=[sin_marcas])
        self.assertEqual(SolveMark.objects.count(), 3)
        self.assertEqual(Solve.objects.get().penalty, '+2')

    def test_marks_vacio_borra_las_marcas(self):
        solve = solve_payload(time_ms=33000, marks=CFOP)
        self.push(solves=[solve])
        solve['marks'] = []
        self.push(solves=[solve])
        self.assertEqual(SolveMark.objects.count(), 0)

    def test_marcas_invalidas_se_rechazan_con_el_motivo(self):
        for marks, text in [
            ([{'stage': 'cross', 'elapsed_ms': 1}, {'stage': 'cross', 'elapsed_ms': 2}], 'dos marcas'),
            ([{'stage': 'cross', 'elapsed_ms': 40000}], 'superar'),
            ([{'stage': 'Cross!', 'elapsed_ms': 1}], 'minúsculas'),
            ([{'stage': 'cross', 'elapsed_ms': -5}], None),
        ]:
            solve = solve_payload(time_ms=33000, marks=marks)
            errors = rejected(self.push(solves=[solve]), 'solves', solve)
            self.assertIsNotNone(errors, marks)
            if text:
                self.assertIn(text, str(errors))
        self.assertEqual(Solve.objects.count(), 0)

    def test_la_inspeccion_no_puede_ser_negativa_ni_absurda(self):
        for value in (-1, 10 * 3600 * 1000 + 1):
            solve = solve_payload(inspection_ms=value)
            self.assertIn('inspection_ms', rejected(self.push(solves=[solve]), 'solves', solve))

    def test_la_hora_de_edicion_nunca_queda_vacia(self):
        self.push(solves=[solve_payload()])
        self.assertIsNotNone(Solve.objects.get().client_updated_at)

    def test_el_borrado_logico_conserva_las_marcas(self):
        solve = solve_payload(time_ms=33000, marks=CFOP)
        self.push(solves=[solve])
        solve['deleted_at'] = '2026-10-23T10:00:00Z'
        self.push(solves=[solve])
        self.assertIsNotNone(Solve.objects.get().deleted_at)
        self.assertEqual(SolveMark.objects.count(), 3)

    def test_otro_usuario_no_puede_cambiar_las_marcas_de_una_resolucion_ajena(self):
        solve = solve_payload(time_ms=33000, marks=CFOP)
        self.push(solves=[solve])
        self.auth(self.other)
        intruso = dict(solve, marks=[])
        self.assertIsNotNone(rejected(self.push(solves=[intruso]), 'solves', intruso))
        self.assertEqual(SolveMark.objects.count(), 3)

    def test_si_la_base_rechaza_un_registro_los_demas_se_guardan_y_no_hay_error_500(self):
        buena, mala = solve_payload(), solve_payload()
        original = Solve.save

        def save(obj, *args, **kwargs):
            if str(obj.pk) == mala['id']:
                raise IntegrityError('restricción simulada')
            return original(obj, *args, **kwargs)

        with mock.patch.object(Solve, 'save', save):
            response = self.push(solves=[buena, mala])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['accepted']['solves'], [buena['id']])
        self.assertIn(mala['id'], response.json()['rejected']['solves'])
        self.assertEqual(Solve.objects.count(), 1)


class SegmentedAttempts(ApiTestCase):
    def test_el_reconocimiento_del_cliente_se_guarda_como_inspeccion(self):
        attempt = attempt_payload(recognition_ms=1300)
        self.push(attempts=[attempt])
        self.assertEqual(Attempt.objects.get().inspection_ms, 1300)
        self.assertEqual(self.client.get('/api/sync/').json()['attempts'][0]['recognition_ms'], 1300)

    def test_intento_cross_mas_par_con_marcas(self):
        attempt = attempt_payload(zone='cross-pair', case_id=None, time_ms=9000, marks=[{'stage': 'cross', 'elapsed_ms': 4200}])
        self.assertEqual(self.push(attempts=[attempt]).json()['accepted']['attempts'], [attempt['id']])
        self.assertEqual([(m.stage, m.elapsed_ms) for m in AttemptMark.objects.all()], [('cross', 4200)])
        self.assertIsNone(Attempt.objects.get().case_key)

    def test_un_intento_de_conocimiento_no_puede_tener_marcas(self):
        attempt = attempt_payload(mode='conocimiento', time_ms=None, marks=[{'stage': 'cross', 'elapsed_ms': 1}])
        self.assertIsNotNone(rejected(self.push(attempts=[attempt]), 'attempts', attempt))

    def test_el_intento_es_independiente_no_exige_ninguna_resolucion_ni_sesion(self):
        attempt = attempt_payload()
        self.assertEqual(self.push(attempts=[attempt]).status_code, 200)
        self.assertEqual((Solve.objects.count(), Attempt.objects.count()), (0, 1))
        self.assertNotIn('session', self.client.get('/api/sync/').json()['attempts'][0])

    def test_una_zona_nueva_no_necesita_migracion(self):
        combinado = attempt_payload(zone='oll-pll', case_id=None, marks=[{'stage': 'oll', 'elapsed_ms': 900}])
        self.assertEqual(self.push(attempts=[combinado]).json()['accepted']['attempts'], [combinado['id']])

    def test_los_campos_retirados_se_aceptan_vacios_pero_no_con_contenido(self):
        self.assertEqual(self.push(attempts=[attempt_payload(moves=None, stage_marks=None)]).status_code, 200)
        for field, value in [('moves', ['R', 'U']), ('stage_marks', {'cross': 1})]:
            attempt = attempt_payload(**{field: value})
            self.assertIn(field, rejected(self.push(attempts=[attempt]), 'attempts', attempt))

    def test_cadena_vacia_y_null_son_lo_mismo_en_la_base(self):
        attempt = attempt_payload(case_id='', algorithm_id='', algorithm_notation='')
        self.push(attempts=[attempt])
        row = Attempt.objects.get()
        self.assertEqual((row.case_key, row.algorithm_ref, row.algorithm_notation), (None, None, None))

    def test_indicar_el_algoritmo_exige_su_notacion(self):
        attempt = attempt_payload(algorithm_id='oll-27#1', algorithm_notation='')
        self.assertIn('algorithm_notation', rejected(self.push(attempts=[attempt]), 'attempts', attempt))