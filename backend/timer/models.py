import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models

MAX_TIME_MS = 10 * 60 * 60 * 1000  # 10 horas: cualquier cosa mayor es un error


class Session(models.Model):
    """Agrupa resoluciones (por ejemplo "Entrenamiento 3x3")."""

    # El id lo genera el cliente (UUID), para poder crear datos sin conexión.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sessions')
    name = models.CharField(max_length=100)
    puzzle = models.CharField(max_length=20, default='3x3')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # borrado lógico

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['user', 'updated_at'])]

    def __str__(self):
        return f'{self.name} ({self.puzzle})'


class Solve(models.Model):
    """Una resolución."""

    class Penalty(models.TextChoices):
        PLUS_TWO = '+2', '+2'
        DNF = 'DNF', 'DNF'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='solves')
    session = models.ForeignKey(
        Session, null=True, blank=True, on_delete=models.SET_NULL, related_name='solves'
    )
    puzzle = models.CharField(max_length=20, default='3x3')
    time_ms = models.PositiveIntegerField(validators=[MaxValueValidator(MAX_TIME_MS)])
    penalty = models.CharField(max_length=3, choices=Penalty.choices, null=True, blank=True)
    scramble = models.TextField(blank=True, default='')
    solved_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # borrado lógico

    class Meta:
        ordering = ['solved_at']
        indexes = [
            models.Index(fields=['user', 'updated_at']),
            models.Index(fields=['user', 'solved_at']),
        ]

    @property
    def effective_time_ms(self):
        """Tiempo con penalización aplicada; None si es DNF."""
        if self.penalty == self.Penalty.DNF:
            return None
        if self.penalty == self.Penalty.PLUS_TWO:
            return self.time_ms + 2000
        return self.time_ms

    def __str__(self):
        return f'{self.puzzle} {self.time_ms} ms ({self.penalty or "ok"})'


class Attempt(models.Model):
    """Intento de una zona de entrenamiento (Cross, F2L, OLL, PLL...)."""

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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='attempts')
    # La zona no tiene `choices`: así se pueden añadir zonas nuevas sin migración.
    zone = models.CharField(max_length=40)
    case_id = models.CharField(max_length=60, null=True, blank=True)
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.EXECUTION)
    scramble = models.TextField(blank=True, default='')
    time_ms = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(MAX_TIME_MS)])
    recognition_ms = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(MAX_TIME_MS)])
    capture = models.CharField(max_length=20, choices=Capture.choices, default=Capture.MANUAL)
    validation = models.CharField(max_length=20, choices=Validation.choices, default=Validation.UNVERIFIED)
    moves = models.JSONField(null=True, blank=True)  # solo si se registraron de verdad
    stage_marks = models.JSONField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    protocol_version = models.PositiveSmallIntegerField(default=1)
    attempted_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # borrado lógico

    class Meta:
        ordering = ['attempted_at']
        indexes = [
            models.Index(fields=['user', 'updated_at']),
            models.Index(fields=['user', 'zone', 'attempted_at']),
        ]

    def __str__(self):
        return f'{self.zone} {self.case_id or ""} {self.time_ms} ms'
