"""
Modelo de datos del cronometraje y el entrenamiento. Principios:

* Se guardan los DATOS ORIGINALES (lo medido); promedios, mejores y duraciones parciales se calculan.
* Las reglas de integridad que importan se garantizan en la base de datos (CHECK, UNIQUE, claves foráneas), no solo
  en los serializadores: cualquier camino de escritura (API, admin, shell) queda cubierto.
* Los registros se crean en el cliente (sin conexión), de ahí los UUID, el borrado lógico y `client_updated_at`.

Semántica temporal de una ejecución cronometrada (Solve y Attempt):

    inspección                ejecución
    |------------|-----------------------------|
    inicio       inicio de ejecución           fin = ended_at
    de inspección  (= ended_at - time_ms)

  ended_at        instante absoluto (UTC) en que terminó la ejecución. Es la única marca absoluta.
  time_ms         duración de la ejecución (tiempo bruto, sin penalización), en milisegundos.
  inspection_ms   duración de la inspección (o del reconocimiento) justo antes de empezar; NULL si no se midió.
  marks           instantes de fin de etapa, en ms DESDE EL INICIO DE LA EJECUCIÓN (no fechas absolutas).

  Todo lo demás se deduce sin guardarlo: inicio de ejecución = ended_at - time_ms; inicio de inspección = inicio de
  ejecución - inspection_ms; duración de una etapa = diferencia entre marcas consecutivas.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

MAX_TIME_MS = 10 * 60 * 60 * 1000  # 10 horas: cualquier cosa mayor es un error


class SyncedRecord(models.Model):
    """Lo que necesita todo registro que se crea en el cliente y se sincroniza."""

    # El id lo genera el cliente (UUID), para poder crear datos sin conexión.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='%(class)ss')
    # Hora del SERVIDOR de la última escritura: es el cursor con el que los clientes piden "lo nuevo".
    updated_at = models.DateTimeField(auto_now=True)
    # Hora del DISPOSITIVO de la última edición: decide qué versión gana si dos dispositivos editan lo mismo.
    client_updated_at = models.DateTimeField(default=timezone.now)
    deleted_at = models.DateTimeField(null=True, blank=True)  # borrado lógico: así los demás dispositivos se enteran

    class Meta:
        abstract = True
        indexes = [models.Index(fields=['user', 'updated_at'], name='%(app_label)s_%(class)s_sync_idx')]


class Session(SyncedRecord):
    """Agrupa resoluciones (por ejemplo "Entrenamiento 3x3")."""

    name = models.CharField(max_length=100)

    class Meta(SyncedRecord.Meta):
        constraints = [
            # Destino de la clave foránea compuesta de Solve (ver migración 0002): una resolución solo puede
            # apuntar a una sesión de SU MISMO usuario.
            models.UniqueConstraint(fields=['id', 'user'], name='timer_session_id_user_uniq'),
        ]

    def __str__(self):
        return self.name


class TimedRun(SyncedRecord):
    """Una ejecución cronometrada sobre un scramble. Es la base común de Solve y Attempt."""

    scramble = models.TextField(blank=True, default='')
    inspection_ms = models.PositiveIntegerField(null=True, blank=True)
    ended_at = models.DateTimeField()

    class Meta(SyncedRecord.Meta):
        abstract = True
        constraints = [
            models.CheckConstraint(
                condition=Q(inspection_ms__isnull=True) | Q(inspection_ms__lte=MAX_TIME_MS),
                name='%(app_label)s_%(class)s_inspection_range',
            ),
        ]


class Solve(TimedRun):
    """Una resolución convencional del cronómetro."""

    class Penalty(models.TextChoices):
        PLUS_TWO = '+2', '+2'
        DNF = 'DNF', 'DNF'

    # Sin restricción en la base de datos: la garantiza la clave compuesta (session_id, user_id) de la migración 0002.
    session = models.ForeignKey(
        Session, null=True, blank=True, on_delete=models.SET_NULL, related_name='solves', db_constraint=False,
    )
    puzzle = models.CharField(max_length=20, default='3x3')
    time_ms = models.PositiveIntegerField()
    penalty = models.CharField(max_length=3, choices=Penalty.choices, null=True, blank=True)


    class Meta(TimedRun.Meta):
        ordering = ['ended_at']
        indexes = TimedRun.Meta.indexes + [models.Index(fields=['user', 'ended_at'], name='timer_solve_user_ended_idx')]
        constraints = TimedRun.Meta.constraints + [
            models.CheckConstraint(condition=Q(time_ms__lte=MAX_TIME_MS), name='timer_solve_time_range'),
            models.CheckConstraint(
                condition=Q(penalty__isnull=True) | Q(penalty__in=['+2', 'DNF']), name='timer_solve_penalty_valid',
            ),
        ]

    @property
    def effective_time_ms(self):
        """Tiempo con penalización aplicada; None si es DNF. Se calcula: no se guarda."""
        if self.penalty == self.Penalty.DNF:
            return None
        if self.penalty == self.Penalty.PLUS_TWO:
            return self.time_ms + 2000
        return self.time_ms

    def __str__(self):
        return f'{self.puzzle} {self.time_ms} ms ({self.penalty or "ok"})'


class Attempt(TimedRun):
    """
    Intento de un ejercicio de entrenamiento (Cross, F2L, OLL, PLL...). NO es una resolución: no pertenece a una
    sesión ni tiene penalización, y puede ser de conocimiento (sin tiempo).
    """

    class Mode(models.TextChoices):
        EXECUTION = 'ejecucion', 'Ejecución'
        KNOWLEDGE = 'conocimiento', 'Conocimiento'

    class Capture(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        ASSISTED = 'asistido', 'Asistido'
        AUTOMATIC = 'automatico', 'Automático'

    class Validation(models.TextChoices):
        VALID = 'valida', 'Válida'
        INVALID = 'invalida', 'Inválida'
        UNVERIFIED = 'sin_verificar', 'Sin verificar'

    # La zona no tiene `choices`: así se pueden añadir zonas nuevas (p. ej. OLL+PLL) sin migración.
    zone = models.CharField(max_length=40)
    # Caso dentro de la zona según el catálogo del cliente ("oll-27"); NULL en las zonas sin casos.
    case_key = models.CharField(max_length=60, null=True, blank=True)
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.EXECUTION)
    # Algoritmo usado, copiado tal cual: cambiar después el recomendado del catálogo no altera el historial.
    # `algorithm_ref` es el identificador opaco del cliente (no una clave foránea).
    algorithm_ref = models.CharField(max_length=80, null=True, blank=True)
    algorithm_notation = models.TextField(null=True, blank=True)
    time_ms = models.PositiveIntegerField(null=True, blank=True)  # NULL en la modalidad de conocimiento
    capture = models.CharField(max_length=20, choices=Capture.choices, default=Capture.MANUAL)
    validation = models.CharField(max_length=20, choices=Validation.choices, default=Validation.UNVERIFIED)
    notes = models.TextField(blank=True, default='')
    protocol_version = models.PositiveSmallIntegerField(default=1)


    class Meta(TimedRun.Meta):
        ordering = ['ended_at']
        indexes = TimedRun.Meta.indexes + [
            # Estadísticas por zona y por caso en el tiempo (el prefijo (user, zone) sirve a las consultas por zona).
            models.Index(fields=['user', 'zone', 'case_key', 'ended_at'], name='timer_attempt_case_idx'),
        ]
        constraints = TimedRun.Meta.constraints + [
            models.CheckConstraint(condition=Q(mode__in=['ejecucion', 'conocimiento']), name='timer_attempt_mode_valid'),
            models.CheckConstraint(condition=Q(capture__in=['manual', 'asistido', 'automatico']), name='timer_attempt_capture_valid'),
            models.CheckConstraint(
                condition=Q(validation__in=['valida', 'invalida', 'sin_verificar']), name='timer_attempt_validation_valid',
            ),
            # Una prueba de ejecución sin tiempo no tiene sentido; una de conocimiento sí.
            models.CheckConstraint(
                condition=Q(mode='conocimiento') | Q(time_ms__isnull=False), name='timer_attempt_execution_has_time',
            ),
            models.CheckConstraint(
                condition=Q(time_ms__isnull=True) | Q(time_ms__lte=MAX_TIME_MS), name='timer_attempt_time_range',
            ),
            # Si se indica qué algoritmo se usó, hay que conservar su notación.
            models.CheckConstraint(
                condition=Q(algorithm_ref__isnull=True) | Q(algorithm_notation__isnull=False), name='timer_attempt_algorithm_has_notation',
            ),
        ]

    def __str__(self):
        return f'{self.zone} {self.case_key or ""} {self.time_ms} ms'


class StageMark(models.Model):
    """Fin de una etapa dentro de una ejecución, en ms desde el inicio de la ejecución."""

    stage = models.CharField(max_length=40)  # código de la etapa según la modalidad ("cross", "f2l", "oll", "pll"...)
    elapsed_ms = models.PositiveIntegerField()


    class Meta:
        abstract = True
        ordering = ['elapsed_ms']


class SolveMark(StageMark):
    solve = models.ForeignKey(Solve, on_delete=models.CASCADE, related_name='marks')

    class Meta(StageMark.Meta):
        constraints = [
            models.UniqueConstraint(fields=['solve', 'stage'], name='timer_solvemark_stage_uniq'),
            models.CheckConstraint(condition=Q(elapsed_ms__lte=MAX_TIME_MS), name='timer_solvemark_range'),
        ]

    def __str__(self):
        return f'{self.stage} @ {self.elapsed_ms} ms'


class AttemptMark(StageMark):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name='marks')

    class Meta(StageMark.Meta):
        constraints = [
            models.UniqueConstraint(fields=['attempt', 'stage'], name='timer_attemptmark_stage_uniq'),
            models.CheckConstraint(condition=Q(elapsed_ms__lte=MAX_TIME_MS), name='timer_attemptmark_range'),
        ]

    def __str__(self):
        return f'{self.stage} @ {self.elapsed_ms} ms'
