import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Profile(models.Model):
    """Datos de perfil de una cuenta. Todo usuario autenticado tiene (o obtiene al usarla) uno."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    display_name = models.CharField(max_length=60, blank=True)
    # Correo en minúsculas: garantiza una sola cuenta por correo (sin importar mayúsculas).
    email_key = models.CharField(max_length=254, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Perfil de {self.user.username}'


class GoogleIdentity(models.Model):
    """Vínculo entre una cuenta y una identidad de Google (`sub` es el identificador estable de Google)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='google_identities')
    sub = models.CharField(max_length=64, unique=True)
    email = models.EmailField(blank=True)
    linked_at = models.DateTimeField(auto_now_add=True)


def hash_key(key):
    return hashlib.sha256(key.encode()).hexdigest()


class AuthToken(models.Model):
    """
    Sesión de un dispositivo. A diferencia del token estándar de DRF (uno por usuario), cada inicio
    de sesión crea el suyo, así que cerrar sesión en un dispositivo no cierra las demás. Solo se guarda
    el hash: si la base de datos se filtrara, los tokens no se podrían usar.
    """

    key_hash = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='auth_tokens')
    created_at = models.DateTimeField(default=timezone.now)
    last_used_at = models.DateTimeField(null=True, blank=True)
    device = models.CharField(max_length=120, blank=True)

    @classmethod
    def issue(cls, user, device=''):
        """Crea una sesión nueva y devuelve (registro, token en claro). El token en claro no se guarda."""
        raw = secrets.token_urlsafe(32)
        return cls.objects.create(user=user, key_hash=hash_key(raw), device=device[:120]), raw

    @property
    def expires_at(self):
        return self.created_at + timedelta(days=settings.AUTH_TOKEN_TTL_DAYS)

    @property
    def expired(self):
        return timezone.now() >= self.expires_at