from datetime import timezone as dt_timezone

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ParseError, PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Attempt, Session, Solve
from .serializers import AttemptSerializer, SessionSerializer, SolveSerializer


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Sin autenticación: el cliente lo usa para saber si el servidor está al alcance."""
    return Response({'status': 'ok'})


def _upsert(model, user, validated_items):
    """Crea o actualiza cada elemento por id. Es idempotente: repetir el envío no duplica."""
    for data in validated_items:
        data = dict(data)
        pk = data.pop('id')
        obj = model.objects.filter(pk=pk).first()
        if obj is None:
            obj = model(pk=pk, user=user)
        elif obj.user_id != user.id:
            raise PermissionDenied(f'El id {pk} pertenece a otro usuario.')
        for field, value in data.items():
            setattr(obj, field, value)
        obj.save()  # updated_at se renueva solo


def _as_list(value, name):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ParseError(f'"{name}" debe ser una lista.')
    return value


class SyncView(APIView):
    """
    Sincronización con los clientes (web / Android).

    GET  /api/sync/?since=<fecha ISO 8601>
        Devuelve lo creado, modificado o borrado desde `since` (todo, si se omite).
        Guarda `server_time` de la respuesta y úsalo como `since` en la próxima.

    POST /api/sync/   {"sessions": [...], "solves": [...], "attempts": [...]}
        Sube cambios en lote. Gana la última escritura en llegar al servidor.
    """

    authentication_classes = [TokenAuthentication]

    def get(self, request):
        server_time = timezone.now()  # se toma antes de consultar, para no perder cambios
        sessions = Session.objects.filter(user=request.user)
        solves = Solve.objects.filter(user=request.user)
        attempts = Attempt.objects.filter(user=request.user)

        raw = request.query_params.get('since')
        if raw:
            since = parse_datetime(raw.replace(' ', '+'))  # un '+' sin codificar llega como espacio
            if since is None:
                raise ParseError('"since" debe ser una fecha ISO 8601.')
            if timezone.is_naive(since):
                since = since.replace(tzinfo=dt_timezone.utc)
            sessions = sessions.filter(updated_at__gt=since)
            solves = solves.filter(updated_at__gt=since)
            attempts = attempts.filter(updated_at__gt=since)

        return Response(
            {
                'server_time': server_time,
                'sessions': SessionSerializer(sessions, many=True).data,
                'solves': SolveSerializer(solves, many=True).data,
                'attempts': AttemptSerializer(attempts, many=True).data,
            }
        )

    @transaction.atomic
    def post(self, request):
        context = {'request': request}

        # Primero las sesiones: las resoluciones pueden apuntar a sesiones nuevas del mismo envío.
        sessions = SessionSerializer(
            data=_as_list(request.data.get('sessions'), 'sessions'), many=True, context=context
        )
        sessions.is_valid(raise_exception=True)
        _upsert(Session, request.user, sessions.validated_data)

        solves = SolveSerializer(
            data=_as_list(request.data.get('solves'), 'solves'), many=True, context=context
        )
        solves.is_valid(raise_exception=True)
        _upsert(Solve, request.user, solves.validated_data)

        attempts = AttemptSerializer(
            data=_as_list(request.data.get('attempts'), 'attempts'), many=True, context=context
        )
        attempts.is_valid(raise_exception=True)
        _upsert(Attempt, request.user, attempts.validated_data)

        return Response(
            {
                'server_time': timezone.now(),
                'sessions': len(sessions.validated_data),
                'solves': len(solves.validated_data),
                'attempts': len(attempts.validated_data),
            }
        )
