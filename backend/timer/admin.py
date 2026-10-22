from django.contrib import admin

from .models import Attempt, Session, Solve


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('name', 'puzzle', 'user', 'created_at', 'deleted_at')
    list_filter = ('puzzle', 'user')


@admin.register(Solve)
class SolveAdmin(admin.ModelAdmin):
    list_display = ('solved_at', 'puzzle', 'time_ms', 'penalty', 'user', 'deleted_at')
    list_filter = ('puzzle', 'penalty', 'user')
    date_hierarchy = 'solved_at'


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ('attempted_at', 'zone', 'case_id', 'mode', 'time_ms', 'validation', 'user', 'deleted_at')
    list_filter = ('zone', 'mode', 'validation', 'user')
    date_hierarchy = 'attempted_at'
