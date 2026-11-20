"""
Configuración del backend. Todo lo sensible o que cambia según el entorno
se lee de variables de entorno (ver .env.example en la raíz del repo).
"""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_list(name, default=''):
    return [v.strip() for v in os.environ.get(name, default).split(',') if v.strip()]


DEV_SECRET_KEY = 'dev-only-insecure-key-change-me'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', DEV_SECRET_KEY)
DEBUG = os.environ.get('DJANGO_DEBUG', '0') == '1'
if not DEBUG and SECRET_KEY == DEV_SECRET_KEY:
    raise ImproperlyConfigured('Define DJANGO_SECRET_KEY cuando DJANGO_DEBUG no es 1.')

# Para entrar desde otro dispositivo de la red local, agrega aquí la IP o el
# nombre del PC servidor (por ejemplo 192.168.1.50). localhost y 127.0.0.1 se
# permiten siempre: el healthcheck de Docker llama al backend desde dentro de su
# propio contenedor.
ALLOWED_HOSTS = sorted({*env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1'), 'localhost', '127.0.0.1'})

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'timer',
    'accounts',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# PostgreSQL cuando hay POSTGRES_DB (Docker); SQLite en caso contrario
# (útil para correr las pruebas sin levantar la base de datos).
if os.environ.get('POSTGRES_DB'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ['POSTGRES_DB'],
            'USER': os.environ.get('POSTGRES_USER', 'speedcube'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es'
TIME_ZONE = 'America/Santiago'
USE_I18N = True
USE_TZ = True  # todo se guarda en UTC

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['accounts.authentication.TokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    # Límite de intentos por IP en registro, inicio de sesión, recuperación y Google (frena la fuerza bruta).
    'DEFAULT_THROTTLE_RATES': {'auth': os.environ.get('AUTH_THROTTLE_RATE', '30/hour')},
}

# Orígenes del frontend autorizados a llamar a la API.
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'http://localhost:5173')

# Orígenes de confianza para los formularios del panel /admin (con http://).
# La API usa token, no cookies, así que no depende de esto.
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000')

# --- Cuentas ---
# Días que dura una sesión (token) sin volver a iniciar sesión.
AUTH_TOKEN_TTL_DAYS = int(os.environ.get('AUTH_TOKEN_TTL_DAYS', '30'))
# Identificador de cliente de Google OAuth (vacío = el inicio de sesión con Google queda desactivado).
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
# Dirección del frontend, para los enlaces de los correos de recuperación de contraseña.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173').rstrip('/')

# Correo: por defecto se escribe en la consola del backend (útil en desarrollo). Para enviarlo de verdad,
# define EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend y los datos del servidor SMTP.
EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '25'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', '0') == '1'
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Speedcube Timer <no-reply@localhost>')