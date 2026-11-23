import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone


class User(AbstractUser):
    """
    Cuenta de usuario. Es el modelo de usuario del proyecto (AUTH_USER_MODEL).

    Un administrador es una cuenta normal con `is_staff` / `is_superuser`: no hay roles propios.
    Lo que antes vivía en una tabla `Profile` (nombre visible y correo normalizado) es ahora parte del usuario, y la
    unicidad de usuario y correo la garantiza la base de datos, no solo la validación.
    """

    first_name = None  # no se usan: el nombre que se muestra es `display_name`
    last_name = None
    email = models.EmailField(max_length=254, blank=True)  # vacío = sin correo (p. ej. un admin creado por consola)
    display_name = models.CharField(max_length=60, blank=True)  # vacío = se muestra el usuario

    class Meta(AbstractUser.Meta):
        constraints = [
            # "Ana" y "ana" son el mismo usuario.
            models.UniqueConstraint(Lower('username'), name='accounts_user_username_ci_uniq'),
            # Un correo, una cuenta. Los correos vacíos no cuentan (puede haber varias cuentas sin correo).
            models.UniqueConstraint(fields=['email'], condition=~Q(email=''), name='accounts_user_email_uniq'),
            # El correo se guarda siempre en minúsculas, así la unicidad no depende de mayúsculas.
            models.CheckConstraint(condition=Q(email=Lower('email')), name='accounts_user_email_lowercase'),
        ]

    def clean(self):
        # Se normaliza también aquí porque la validación de restricciones (formularios, admin) corre ANTES de save().
        super().clean()
        self.email = (self.email or '').strip().lower()

    def save(self, *args, **kwargs):
        self.email = (self.email or '').strip().lower()
        super().save(*args, **kwargs)

    @property
    def shown_name(self):
        return self.display_name or self.username


class GoogleIdentity(models.Model):
    """La cuenta de Google vinculada a un usuario (como máximo una). `sub` es el identificador estable de Google."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='google_identity')
    sub = models.CharField(max_length=255, unique=True)  # Google garantiza hasta 255 caracteres
    # Correo de la cuenta de Google al vincular: puede diferir del correo de la cuenta, y sirve para saber cuál es.
    email = models.EmailField(blank=True)
    linked_at = models.DateTimeField(auto_now_add=True)


def hash_key(key):
    return hashlib.sha256(key.encode()).hexdigest()


class AuthToken(models.Model):
    """
    Sesión de un dispositivo. A diferencia del token estándar de DRF (uno por usuario), cada inicio de sesión crea el
    suyo, así que cerrar sesión en un dispositivo no cierra las demás. Solo se guarda el hash: si la base de datos se
    filtrara, los tokens no se podrían usar.
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