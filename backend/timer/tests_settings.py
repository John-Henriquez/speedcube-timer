from django.conf import settings
from django.test import SimpleTestCase


class ConfiguracionTests(SimpleTestCase):
    def test_loopback_siempre_permitido(self):
        # El healthcheck de Docker llama a http://127.0.0.1:8000/api/health/ dentro del contenedor.
        # Si el .env solo permitiera otra dirección, el backend aparecería "unhealthy" por error.
        self.assertIn('127.0.0.1', settings.ALLOWED_HOSTS)
        self.assertIn('localhost', settings.ALLOWED_HOSTS)

    def test_health_responde_desde_loopback(self):
        response = self.client.get('/api/health/', HTTP_HOST='127.0.0.1:8000')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_origenes_csrf_llevan_esquema(self):
        # Django exige el esquema (http://) en CSRF_TRUSTED_ORIGINS; sin él falla al arrancar.
        for origin in settings.CSRF_TRUSTED_ORIGINS:
            self.assertRegex(origin, r'^https?://')