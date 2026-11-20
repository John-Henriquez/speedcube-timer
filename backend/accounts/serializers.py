import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Profile

User = get_user_model()

USERNAME_RE = re.compile(r'^[\w.-]+$')


def normalize_email(email):
    return (email or '').strip().lower()


def email_taken(email, exclude_user=None):
    key = normalize_email(email)
    qs = Profile.objects.filter(email_key=key)
    legacy = User.objects.filter(email__iexact=key)  # cuentas anteriores a los perfiles
    if exclude_user is not None:
        qs, legacy = qs.exclude(user=exclude_user), legacy.exclude(pk=exclude_user.pk)
    return qs.exists() or legacy.exists()


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=30)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=60)

    def validate_username(self, value):
        value = value.strip()
        if not USERNAME_RE.match(value):
            raise serializers.ValidationError('Usa solo letras, números, puntos, guiones y guiones bajos.')
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya está en uso.')
        return value

    def validate_email(self, value):
        if email_taken(value):
            raise serializers.ValidationError('Ya existe una cuenta con este correo.')
        return normalize_email(value)

    def validate(self, attrs):
        validate_password(attrs['password'], user=User(username=attrs['username'], email=attrs['email']))
        return attrs


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)  # nombre de usuario o correo
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class ProfileUpdateSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=60, allow_blank=True)


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, trim_whitespace=False, required=False, allow_blank=True)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class GoogleCredentialSerializer(serializers.Serializer):
    credential = serializers.CharField(max_length=4096)