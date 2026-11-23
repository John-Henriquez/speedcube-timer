import importlib
from types import SimpleNamespace

from django.db import connection
from django.test import TestCase

MIGRATION = importlib.import_module('timer.migrations.0002_solve_session_same_user')
editor = SimpleNamespace(connection=connection)  # la guarda solo necesita la conexión


class LegacySchemaGuard(TestCase):
    def test_una_instalacion_limpia_pasa_la_guarda(self):
        MIGRATION.refuse_legacy_schema(None, editor)  # no lanza

    def test_el_esquema_anterior_se_rechaza_con_instrucciones_claras(self):
        with connection.cursor() as cursor:
            cursor.execute('CREATE TABLE accounts_profile (id integer)')  # resto del esquema anterior
        with self.assertRaisesMessage(RuntimeError, 'docker compose down -v'):
            MIGRATION.refuse_legacy_schema(None, editor)

    def test_el_mensaje_explica_que_borra_datos_y_como_crear_el_administrador(self):
        self.assertIn('BORRA los datos', MIGRATION.LEGACY_MESSAGE)
        self.assertIn('createsuperuser', MIGRATION.LEGACY_MESSAGE)