# API

Base: `http://localhost:8000/api/`. Todo es JSON. Las rutas que piden sesión llevan el encabezado
`Authorization: Token <token>`; el token se obtiene al registrarse o iniciar sesión (no es el token estándar de DRF).

Los campos exactos de resoluciones e intentos están en `backend/timer/serializers.py`; aquí se describe el contrato. El esquema de la
base de datos se explica en [modelo-de-datos.md](modelo-de-datos.md).

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
`409 link_required` (Google: ya existe una cuenta con ese correo, hay que vincular desde el perfil), `google_taken` o
`google_already_linked` (la cuenta ya tiene otra cuenta de Google vinculada);
 `429` demasiados intentos; `501 google_not_configured`; `503 google_unavailable`.

## Sincronización (`/api/sync/`, exige sesión)

**GET** `?since=<fecha ISO 8601>`: lo creado, modificado o borrado desde esa fecha, solo de la cuenta autenticada. Sin
`since`, devuelve todo. La respuesta trae `server_time`: se guarda y se usa como `since` la próxima vez. El servidor solapa la
consulta unos segundos (`SYNC_CURSOR_OVERLAP_SECONDS`, 5 por defecto; 0 la desactiva) para no perder una escritura que se confirma
fuera de orden: puede devolver registros ya recibidos, y es inocuo reaplicarlos.

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
- Si la base de datos rechaza un registro, queda en `rejected` y el resto del envío se guarda.
- Los borrados son lógicos (`deleted_at`) para que los demás dispositivos se enteren.
- Los identificadores los genera el cliente (UUID), lo que hace idempotente el envío.

### Resoluciones e intentos

Campos opcionales de la 0.11.0 (el cliente actual no los envía):

| Campo | En | Significado |
|---|---|---|
| `inspection_ms` | resolución | Duración de la inspección en ms; `null` si no se midió. En los intentos, el mismo dato se llama `recognition_ms` |
| `marks` | resolución e intento | `[{"stage": "cross", "elapsed_ms": 4100}, ...]`: fin de cada etapa, en ms **desde el inicio de la ejecución**. Si falta el campo, las marcas existentes no se tocan; si viene (aunque vacío), reemplaza el conjunto |
| `client_updated_at` | ambos | Hora de la última edición en el dispositivo. Si falta, se usa la de recepción |

Tiempos, inspección y marcas son enteros en milisegundos entre 0 y 10 horas; `elapsed_ms` no puede superar `time_ms`, y una etapa
no puede repetirse. `solved_at` y `attempted_at` son el instante en que **terminó** la ejecución. `moves` y `stage_marks` ya no se
guardan: se aceptan vacíos (`null`) y se rechazan con contenido. `created_at` ya no se devuelve.