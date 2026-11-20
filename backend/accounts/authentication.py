from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication as BaseTokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import AuthToken, hash_key


class TokenAuthentication(BaseTokenAuthentication):
    """Encabezado `Authorization: Token <token>`. Valida contra el hash guardado y respeta la caducidad."""

    keyword = 'Token'

    def authenticate_credentials(self, key):
        try:
            token = AuthToken.objects.select_related('user').get(key_hash=hash_key(key))
        except AuthToken.DoesNotExist:
            raise AuthenticationFailed('Sesión no válida.')
        if not token.user.is_active:
            raise AuthenticationFailed('Cuenta desactivada.')
        if token.expired:
            token.delete()
            raise AuthenticationFailed('La sesión caducó. Inicia sesión de nuevo.')
        now = timezone.now()
        if token.last_used_at is None or now - token.last_used_at > timedelta(hours=1):
            AuthToken.objects.filter(pk=token.pk).update(last_used_at=now)  # como mucho una vez por hora
        return token.user, token