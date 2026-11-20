from django.conf import settings


class GoogleNotConfigured(Exception):
    pass


def verify_google_credential(credential):
    """
    Verifica un ID token de Google (firma, caducidad, emisor y destinatario) y devuelve sus datos.
    Lanza ValueError si no es válido y GoogleNotConfigured si falta GOOGLE_CLIENT_ID.
    Está aparte para poder sustituirla en las pruebas sin llamar a Google.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleNotConfigured()
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)