from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .forms import UserChangeForm, UserCreationForm
from .models import AuthToken, GoogleIdentity, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """El usuario estándar de Django, con `display_name` y sin los campos de nombre y apellido (no existen)."""

    form = UserChangeForm
    add_form = UserCreationForm
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Datos personales', {'fields': ('display_name', 'email')}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Fechas', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('username', 'email', 'display_name', 'password1', 'password2')}),
    )
    list_display = ('username', 'display_name', 'email', 'is_staff', 'is_active', 'date_joined')
    search_fields = ('username', 'display_name', 'email')
    ordering = ('username',)


@admin.register(GoogleIdentity)
class GoogleIdentityAdmin(admin.ModelAdmin):
    list_display = ('user', 'email', 'linked_at')
    readonly_fields = ('sub', 'linked_at')


@admin.register(AuthToken)
class AuthTokenAdmin(admin.ModelAdmin):
    """Solo consulta: se guarda el hash del token, que no sirve para iniciar sesión."""

    list_display = ('user', 'device', 'created_at', 'last_used_at')
    readonly_fields = ('user', 'key_hash', 'device', 'created_at', 'last_used_at')
    list_filter = ('user',)

    def has_add_permission(self, request):
        return False