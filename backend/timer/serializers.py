"""
Formato de la API de sincronización. El esquema de la base de datos puede cambiar (nombres, normalización) sin
romper a los clientes: estos serializadores traducen entre ambos. Nombres que la API conserva por compatibilidad:
`solved_at` / `attempted_at` (= `ended_at`), `case_id` (= `case_key`), `algorithm_id` (= `algorithm_ref`) y
`recognition_ms` (= `inspection_ms`, solo en intentos).
"""
import re

from rest_framework import serializers

from .models import MAX_TIME_MS, Attempt, Session, Solve

STAGE_RE = re.compile(r'^[a-z0-9][a-z0-9_-]{0,39}$')


class MarkSerializer(serializers.Serializer):
    """Fin de una etapa: instante en ms DESDE EL INICIO DE LA EJECUCIÓN (no una fecha absoluta)."""

    stage = serializers.RegexField(STAGE_RE, error_messages={'invalid': 'Usa un código en minúsculas: letras, números, guion o guion bajo.'})
    elapsed_ms = serializers.IntegerField(min_value=0, max_value=MAX_TIME_MS)


def validate_marks(marks, time_ms):
    """Reglas de las marcas que no puede expresar un campo suelto."""
    if not marks:
        return
    stages = [m['stage'] for m in marks]
    if len(stages) != len(set(stages)):
        raise serializers.ValidationError({'marks': 'Una etapa no puede tener dos marcas.'})
    if time_ms is None:
        raise serializers.ValidationError({'marks': 'Sin tiempo de ejecución no puede haber marcas de etapa.'})
    if any(m['elapsed_ms'] > time_ms for m in marks):
        raise serializers.ValidationError({'marks': 'Una marca no puede superar la duración de la ejecución.'})


class SyncedSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField()  # lo define el cliente
    # Si falta, el servidor usa la hora de recepción (ver sync): la columna nunca queda vacía.
    client_updated_at = serializers.DateTimeField(required=False, allow_null=True)


class SessionSerializer(SyncedSerializer):
    class Meta:
        model = Session
        fields = ['id', 'name', 'updated_at', 'client_updated_at', 'deleted_at']
        read_only_fields = ['updated_at']


class TimedRunSerializer(SyncedSerializer):
    marks = MarkSerializer(many=True, required=False)  # si no viene, las marcas existentes no se tocan


class SolveSerializer(TimedRunSerializer):
    solved_at = serializers.DateTimeField(source='ended_at')

    class Meta:
        model = Solve
        fields = [
            'id', 'session', 'puzzle', 'time_ms', 'penalty', 'scramble', 'solved_at', 'inspection_ms', 'marks',
            'updated_at', 'client_updated_at', 'deleted_at',
        ]
        read_only_fields = ['updated_at']
        extra_kwargs = {
            'time_ms': {'max_value': MAX_TIME_MS},
            'inspection_ms': {'max_value': MAX_TIME_MS, 'allow_null': True, 'required': False},
        }

    def get_fields(self):
        fields = super().get_fields()
        # Una resolución solo puede apuntar a sesiones del mismo usuario (la base de datos lo garantiza también).
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            fields['session'].queryset = Session.objects.filter(user=user)
        else:
            fields['session'].queryset = Session.objects.none()
        return fields

    def validate_penalty(self, value):
        return value or None  # "" se guarda como NULL

    def validate(self, data):
        validate_marks(data.get('marks'), data.get('time_ms'))
        return data


class AttemptSerializer(TimedRunSerializer):
    attempted_at = serializers.DateTimeField(source='ended_at')
    case_id = serializers.CharField(source='case_key', max_length=60, required=False, allow_null=True, allow_blank=True)
    algorithm_id = serializers.CharField(source='algorithm_ref', max_length=80, required=False, allow_null=True, allow_blank=True)
    algorithm_notation = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    recognition_ms = serializers.IntegerField(source='inspection_ms', min_value=0, max_value=MAX_TIME_MS, required=False, allow_null=True)
    # Campos retirados: nunca se llegaron a rellenar. Se aceptan vacíos (los clientes actuales los envían en null).
    moves = serializers.JSONField(write_only=True, required=False, allow_null=True)
    stage_marks = serializers.JSONField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Attempt
        fields = [
            'id', 'zone', 'case_id', 'mode', 'scramble', 'algorithm_id', 'algorithm_notation', 'time_ms', 'recognition_ms',
            'capture', 'validation', 'notes', 'protocol_version', 'attempted_at', 'marks',
            'moves', 'stage_marks', 'updated_at', 'client_updated_at', 'deleted_at',
        ]
        read_only_fields = ['updated_at']
        extra_kwargs = {'time_ms': {'max_value': MAX_TIME_MS}}

    def validate_stage_marks(self, value):
        if value is not None:
            raise serializers.ValidationError('Este campo ya no se guarda: usa "marks".')
        return value

    def validate(self, data):
        data.pop('moves', None)
        data.pop('stage_marks', None)
        # "" y NULL significan lo mismo ("no hay"): en la base de datos solo existe NULL.
        for key in ('case_key', 'algorithm_ref', 'algorithm_notation'):
            if key in data and not data[key]:
                data[key] = None
        if data.get('algorithm_ref') and not data.get('algorithm_notation'):
            raise serializers.ValidationError({'algorithm_notation': 'Si se indica el algoritmo, hay que indicar su notación.'})
        # Una prueba de ejecución sin tiempo no tiene sentido; una de conocimiento sí.
        if data.get('mode', Attempt.Mode.EXECUTION) == Attempt.Mode.EXECUTION and data.get('time_ms') is None:
            raise serializers.ValidationError({'time_ms': 'Obligatorio en la modalidad de ejecución.'})
        validate_marks(data.get('marks'), data.get('time_ms'))
        return data
