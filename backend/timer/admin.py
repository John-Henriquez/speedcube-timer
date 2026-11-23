from datetime import timedelta

from django.contrib import admin

from .models import Attempt, AttemptMark, Session, Solve, SolveMark


class DerivedTimesMixin:
    """Horas que se deducen de `ended_at`, `time_ms` e `inspection_ms`: se muestran, no se guardan."""

    @admin.display(description='Inicio de ejecución')
    def execution_started_at(self, obj):
        return obj.ended_at - timedelta(milliseconds=obj.time_ms) if obj.time_ms is not None else None

    @admin.display(description='Inicio de inspección')
    def inspection_started_at(self, obj):
        start = self.execution_started_at(obj)
        return start - timedelta(milliseconds=obj.inspection_ms) if start and obj.inspection_ms is not None else None


class SolveMarkInline(admin.TabularInline):
    model = SolveMark
    extra = 0


class AttemptMarkInline(admin.TabularInline):
    model = AttemptMark
    extra = 0


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'updated_at', 'deleted_at')
    list_filter = ('user',)


@admin.register(Solve)
class SolveAdmin(DerivedTimesMixin, admin.ModelAdmin):
    list_display = ('ended_at', 'puzzle', 'time_ms', 'penalty', 'inspection_ms', 'user', 'deleted_at')
    list_filter = ('puzzle', 'penalty', 'user')
    date_hierarchy = 'ended_at'
    readonly_fields = ('execution_started_at', 'inspection_started_at')
    inlines = [SolveMarkInline]


@admin.register(Attempt)
class AttemptAdmin(DerivedTimesMixin, admin.ModelAdmin):
    list_display = ('ended_at', 'zone', 'case_key', 'mode', 'time_ms', 'validation', 'user', 'deleted_at')
    list_filter = ('zone', 'mode', 'validation', 'user')
    date_hierarchy = 'ended_at'
    readonly_fields = ('execution_started_at', 'inspection_started_at')
    inlines = [AttemptMarkInline]
