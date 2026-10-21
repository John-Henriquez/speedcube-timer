from rest_framework import serializers

from .models import Session, Solve


class SessionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()  # lo define el cliente

    class Meta:
        model = Session
        fields = ['id', 'name', 'puzzle', 'created_at', 'updated_at', 'deleted_at']
        read_only_fields = ['created_at', 'updated_at']


class SolveSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()  # lo define el cliente

    class Meta:
        model = Solve
        fields = [
            'id', 'session', 'puzzle', 'time_ms', 'penalty', 'scramble',
            'solved_at', 'created_at', 'updated_at', 'deleted_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_fields(self):
        fields = super().get_fields()
        # Una resolución solo puede apuntar a sesiones del mismo usuario.
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            fields['session'].queryset = Session.objects.filter(user=user)
        else:
            fields['session'].queryset = Session.objects.none()
        return fields

    def validate_penalty(self, value):
        return value or None  # "" se guarda como NULL
