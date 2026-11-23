import logging
import re

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import google
from .models import AuthToken, GoogleIdentity, User
from .serializers import (
    GoogleCredentialSerializer, LoginSerializer, PasswordChangeSerializer, PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer, ProfileUpdateSerializer, RegisterSerializer, email_taken, normalize_email,
)

logger = logging.getLogger(__name__)


def user_payload(user):
    providers = (['password'] if user.has_usable_password() else []) + (['google'] if hasattr(user, 'google_identity') else [])
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'display_name': user.shown_name,
        'providers': providers,
        'date_joined': user.date_joined,
    }


def session_response(request, user, http_status=status.HTTP_200_OK):
    _, raw = AuthToken.issue(user, device=request.META.get('HTTP_USER_AGENT', ''))
    return Response({'token': raw, 'user': user_payload(user)}, status=http_status)


class PublicView(APIView):
    """Vistas sin sesión previa: no aceptan credenciales de otra sesión y limitan los intentos por IP."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'


class RegisterView(PublicView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user = User.objects.create_user(
                username=data['username'], email=data['email'], password=data['password'], display_name=data.get('display_name', ''),
            )
        except IntegrityError:  # otra petición ganó la carrera por el mismo usuario o correo
            return Response({'detail': 'El usuario o el correo ya están en uso.', 'code': 'taken'}, status=status.HTTP_400_BAD_REQUEST)
        return session_response(request, user, status.HTTP_201_CREATED)


def find_user(identifier):
    identifier = identifier.strip()
    user = User.objects.filter(username__iexact=identifier).first()
    if user is None and '@' in identifier:
        user = User.objects.filter(email=normalize_email(identifier)).first()
    return user


class LoginView(PublicView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = find_user(serializer.validated_data['identifier'])
        password = serializer.validated_data['password']
        if user is None:
            User().set_password(password)  # gasta el mismo tiempo, para no revelar qué usuarios existen
        if user is None or not user.is_active or not user.check_password(password):
            return Response({'detail': 'Credenciales incorrectas.', 'code': 'invalid_credentials'}, status=status.HTTP_400_BAD_REQUEST)
        return session_response(request, user)


class LogoutView(APIView):
    def post(self, request):
        request.auth.delete()  # invalida solo la sesión de este dispositivo
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(user_payload(request.user))

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.display_name = serializer.validated_data['display_name'].strip()
        request.user.save(update_fields=['display_name'])
        return Response(user_payload(request.user))


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if user.has_usable_password() and not user.check_password(serializer.validated_data.get('old_password', '')):
            return Response({'detail': 'La contraseña actual no es correcta.', 'code': 'wrong_password'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(serializer.validated_data['new_password'], user=user)
        except DjangoValidationError as error:
            return Response({'new_password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        AuthToken.objects.filter(user=user).exclude(pk=request.auth.pk).delete()  # cierra las demás sesiones
        return Response({'detail': 'Contraseña actualizada.'})


class PasswordResetRequestView(PublicView):
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = find_user(serializer.validated_data['email'])
        if user is not None and user.is_active and user.email:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            link = f'{settings.FRONTEND_URL}/#/reset?uid={uid}&token={default_token_generator.make_token(user)}'
            try:
                send_mail(
                    'Restablece tu contraseña de Speedcube Timer',
                    f'Hola {user.username}:\n\nPara elegir una contraseña nueva abre este enlace (caduca en unas horas):\n{link}\n\n'
                    'Si no lo pediste tú, ignora este mensaje: tu contraseña no cambia.\n',
                    settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False,
                )
            except Exception:  # noqa: BLE001 - un fallo de correo no debe revelar si la cuenta existe
                logger.exception('No se pudo enviar el correo de recuperación')
        # Siempre la misma respuesta, exista o no la cuenta.
        return Response({'detail': 'Si existe una cuenta con ese correo, recibirás un mensaje con las instrucciones.'})


class PasswordResetConfirmView(PublicView):
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        bad = Response({'detail': 'El enlace no es válido o ya caducó.', 'code': 'invalid_link'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(data['uid'])))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return bad
        if not default_token_generator.check_token(user, data['token']):
            return bad
        try:
            validate_password(data['password'], user=user)
        except DjangoValidationError as error:
            return Response({'password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(data['password'])
        user.save(update_fields=['password'])
        AuthToken.objects.filter(user=user).delete()  # nadie sigue con sesión abierta tras un restablecimiento
        return Response({'detail': 'Contraseña actualizada. Ya puedes iniciar sesión.'})


def verified_google_identity(request):
    """Devuelve (datos, None) si la credencial es válida, o (None, respuesta de error)."""
    serializer = GoogleCredentialSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        info = google.verify_google_credential(serializer.validated_data['credential'])
    except google.GoogleNotConfigured:
        return None, Response({'detail': 'El inicio de sesión con Google no está configurado.', 'code': 'google_not_configured'}, status=status.HTTP_501_NOT_IMPLEMENTED)
    except ValueError:
        return None, Response({'detail': 'La credencial de Google no es válida.', 'code': 'google_invalid'}, status=status.HTTP_400_BAD_REQUEST)
    if info.get('email_verified') is not True or not info.get('sub') or not info.get('email'):
        return None, Response({'detail': 'Google no confirma el correo de esta cuenta.', 'code': 'google_email_unverified'}, status=status.HTTP_400_BAD_REQUEST)
    return info, None


def free_username(email):
    base = re.sub(r'[^\w.-]', '', email.split('@')[0])[:24] or 'usuario'
    base = base.ljust(3, '0')
    name, n = base, 1
    while User.objects.filter(username__iexact=name).exists():
        n += 1
        name = f'{base}{n}'
    return name


class GoogleLoginView(PublicView):
    def post(self, request):
        info, error = verified_google_identity(request)
        if error:
            return error
        sub, email = str(info['sub']), normalize_email(info['email'])
        identity = GoogleIdentity.objects.filter(sub=sub).select_related('user').first()
        if identity:
            return session_response(request, identity.user)
        if email_taken(email):
            # No se vincula en silencio: quien registró ese correo con contraseña pudo no ser su dueño.
            return Response(
                {'detail': 'Ya existe una cuenta con este correo. Inicia sesión con tu contraseña y vincula Google desde tu perfil.',
                 'code': 'link_required'},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            with transaction.atomic():
                user = User.objects.create_user(username=free_username(email), email=email, display_name=str(info.get('name') or '')[:60])  # sin contraseña usable
                GoogleIdentity.objects.create(user=user, sub=sub, email=email)
        except IntegrityError:
            return Response({'detail': 'No se pudo crear la cuenta. Inténtalo de nuevo.', 'code': 'conflict'}, status=status.HTTP_409_CONFLICT)
        return session_response(request, user, status.HTTP_201_CREATED)


class GoogleLinkView(APIView):
    def post(self, request):
        info, error = verified_google_identity(request)
        if error:
            return error
        sub = str(info['sub'])
        if GoogleIdentity.objects.filter(sub=sub).exclude(user=request.user).exists():
            return Response({'detail': 'Esa cuenta de Google ya está vinculada a otro usuario.', 'code': 'google_taken'}, status=status.HTTP_409_CONFLICT)
        current = GoogleIdentity.objects.filter(user=request.user).first()
        if current and current.sub != sub:
            return Response({'detail': 'Esta cuenta ya tiene otra cuenta de Google vinculada. Desvincúlala primero.', 'code': 'google_already_linked'}, status=status.HTTP_409_CONFLICT)
        if not current:
            GoogleIdentity.objects.create(user=request.user, sub=sub, email=normalize_email(info['email']))
        return Response(user_payload(User.objects.get(pk=request.user.pk)))


class GoogleUnlinkView(APIView):
    def post(self, request):
        if not request.user.has_usable_password():
            return Response({'detail': 'Define una contraseña antes de desvincular Google, o perderías el acceso.', 'code': 'password_required'}, status=status.HTTP_400_BAD_REQUEST)
        GoogleIdentity.objects.filter(user=request.user).delete()
        return Response(user_payload(User.objects.get(pk=request.user.pk)))