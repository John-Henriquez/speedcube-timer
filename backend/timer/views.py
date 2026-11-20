from datetime import timezone as dt_timezone

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ParseError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Attempt, Session, Solve
from .serializers import AttemptSerializer, SessionSerializer, SolveSerializer

MAX_ITEMS_PER_KIND = 500

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Sin autenticación: el cliente lo usa para saber si el servidor está al alcance."""
    return Response({'status': 'ok'})


def _as_list(value, name):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ParseError(f'"{name}" debe ser una lista.')
    if len(value) > MAX_ITEMS_PER_KIND:
        raise ParseError(f'"{name}" admite como máximo {MAX_ITEMS_PER_KIND} elementos por envío.')
    return value


def _apply(model, serializer_class, items, request):
    """
    Valida y aplica cada elemento POR SEPARADO, de modo que un dato inválido no impide guardar los demás.
    El dueño siempre es request.user: el cliente no puede indicarlo ni tocar registros de otra cuenta.
    Devuelve (aceptados, obsoletos, rechazados):
      - aceptados: guardados (reenviar lo mismo es seguro: no duplica).
      - obsoletos: ya existe una versión más reciente (por hora del dispositivo); la del servidor se conserva.
      - rechazados: { id: errores }, el cliente no debe reintentarlos tal cual.
    """
    accepted, stale, rejected = [], [], {}
    for index, raw in enumerate(items):
        key = raw['id'] if isinstance(raw, dict) and isinstance(raw.get('id'), str) else f'#{index}'
        serializer = serializer_class(data=raw, context={'request': request})
        if not serializer.is_valid():
            rejected[key] = serializer.errors
            continue
        data = dict(serializer.validated_data)
        pk = data.pop('id')
        obj = model.objects.filter(pk=pk).first()
        if obj is None:
            obj = model(pk=pk, user=request.user)
        elif obj.user_id != request.user.id:
            rejected[str(pk)] = {'id': ['Este identificador pertenece a otra cuenta.']}
            continue
        incoming = data.get('client_updated_at')
        current = getattr(obj, 'client_updated_at', None)
        if not obj._state.adding and incoming and current and incoming < current:
            stale.append(str(pk))
            continue
        for field, value in data.items():
            setattr(obj, field, value)
        obj.save()  # updated_at se renueva solo
        accepted.append(str(pk))
    return accepted, stale, rejected

class SyncView(APIView):
    """
    Sincronización con los clientes (web / Android). Exige sesión; todo se limita a la cuenta autenticada.

    GET  /api/sync/?since=<fecha ISO 8601>
        Devuelve lo creado, modificado o borrado desde `since` (todo, si se omite).
        Guarda `server_time` de la respuesta y úsalo como `since` en la próxima.

    POST /api/sync/   {"sessions": [...], "solves": [...], "attempts": [...]}
        Sube cambios en lote. Cada elemento se procesa por separado y la respuesta dice, por id, qué pasó:
        `accepted` (guardado), `stale` (había una versión más reciente) o `rejected` (inválido, con el motivo).
    """


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
        kinds = [
            ('sessions', Session, SessionSerializer),
            ('solves', Solve, SolveSerializer),
            ('attempts', Attempt, AttemptSerializer),
        ]
        payload = {name: _as_list(request.data.get(name), name) for name, _, _ in kinds}
        accepted, stale, rejected = {}, {}, {}
        # En este orden: las resoluciones pueden apuntar a sesiones nuevas del mismo envío.
        for name, model, serializer_class in kinds:
            accepted[name], stale[name], rejected[name] = _apply(model, serializer_class, payload[name], request)

        return Response(
            {
                'server_time': timezone.now(),
                **{name: len(accepted[name]) for name, _, _ in kinds},  # conteos, como antes
                'accepted': accepted,
                'stale': stale,
                'rejected': rejected,
            }
        )
