from django.contrib.auth.forms import UserChangeForm as DjangoUserChangeForm
from django.contrib.auth.forms import UserCreationForm as DjangoUserCreationForm

from .models import User


class UserCreationForm(DjangoUserCreationForm):
    """Los formularios de Django están atados al modelo de usuario estándar: con uno propio hay que reemplazarlos."""

    class Meta(DjangoUserCreationForm.Meta):
        model = User
        fields = ('username', 'email', 'display_name')


class UserChangeForm(DjangoUserChangeForm):
    class Meta(DjangoUserChangeForm.Meta):
        model = User
        fields = '__all__'