# API

Base: `http://localhost:8000/api/`. Todo es JSON. Las rutas que piden sesión llevan el encabezado
`Authorization: Token <token>`; el token se obtiene al registrarse o iniciar sesión (no es el token estándar de DRF).

Los campos exactos de resoluciones e intentos están en `backend/timer/serializers.py`; aquí solo se describe el contrato.

## Estado

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| GET | `/api/health/` | no | Comprueba que el servidor responde |

## Cuentas (`/api/auth/`)

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| POST | `register/` | no | `{username, email, password, display_name?}` → 201 `{token, user}` |
| POST | `login/` | no | `{identifier, password}` (usuario o correo) → 200 `{token, user}` |
| POST | `logout/` | sí | Invalida solo la sesión de este dispositivo → 204 |
| GET, PATCH | `me/` | sí | Perfil. `PATCH {display_name}` |
| POST | `password/change/` | sí | `{old_password, new_password}`; cierra las demás sesiones |
| POST | `password-reset/` | no | `{email}`; responde igual exista o no la cuenta |
| POST | `password-reset/confirm/` | no | `{uid, token, password}` (del enlace del correo); cierra todas las sesiones |
| POST | `google/` | no | `{credential}` (ID token de Google) → 200 o 201 `{token, user}` |
| POST | `google/link/` | sí | `{credential}`; vincula Google a la cuenta actual |
| POST | `google/unlink/` | sí | Desvincula Google (exige tener contraseña) |

Errores habituales: `400` validación (con el detalle por campo) o `invalid_credentials`; `401` sin sesión o sesión caducada;
`409 link_required` (Google: ya existe una cuenta con ese correo, hay que vincular desde el perfil) o `google_taken`;
`429` demasiados intentos; `501 google_not_configured`; `503 google_unavailable`.

## Sincronización (`/api/sync/`, exige sesión)

**GET** `?since=<fecha ISO 8601>`: lo creado, modificado o borrado desde esa fecha, solo de la cuenta autenticada. Sin
`since`, devuelve todo. La respuesta trae `server_time`: se guarda y se usa como `since` la próxima vez.

**POST** `{"sessions": [...], "solves": [...], "attempts": [...]}` (hasta 500 elementos de cada tipo): sube cambios en
lote. **Cada elemento se procesa por separado** y la respuesta dice, por identificador, qué pasó:

| Campo | Significado |
|---|---|
| `accepted` | guardado (reenviar lo mismo es seguro: no duplica) |
| `stale` | el servidor ya tenía una versión más reciente (según `client_updated_at`); se conserva la del servidor |
| `rejected` | inválido o de otra cuenta, con el motivo; no hay que reintentarlo tal cual |

Cada una trae un objeto con las listas `sessions`, `solves` y `attempts`. La respuesta incluye también `server_time` y,
como conteos, `sessions`, `solves` y `attempts` (cuántos se aceptaron).

- El dueño de cada registro siempre es la cuenta autenticada: un `user` enviado en el cuerpo se ignora y un identificador
  de otra cuenta se rechaza.
- Los borrados son lógicos (`deleted_at`) para que los demás dispositivos se enteren.
- Los identificadores los genera el cliente (UUID), lo que hace idempotente el envío.