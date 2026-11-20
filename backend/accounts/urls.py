from django.urls import path

from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view()),
    path('login/', views.LoginView.as_view()),
    path('logout/', views.LogoutView.as_view()),
    path('me/', views.MeView.as_view()),
    path('password/change/', views.PasswordChangeView.as_view()),
    path('password-reset/', views.PasswordResetRequestView.as_view()),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view()),
    path('google/', views.GoogleLoginView.as_view()),
    path('google/link/', views.GoogleLinkView.as_view()),
    path('google/unlink/', views.GoogleUnlinkView.as_view()),
]