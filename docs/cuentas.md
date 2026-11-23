# Cuentas, perfiles y sincronización

La app funciona igual **sin cuenta** (invitado) o **con cuenta**. La diferencia es solo dónde viven los datos.

| | Invitado | Con cuenta |
|---|---|---|
| Dónde se guardan | Solo en este dispositivo (IndexedDB) | En este dispositivo (copia de trabajo) **y** en PostgreSQL (la copia de verdad) |
| Red | Nunca se usa | Se sincroniza sola, sin pulsar nada |
| Sin conexión | Todo funciona | Todo funciona; lo nuevo queda en una cola y se sube al volver la conexión |

## Qué se manda a la base de datos y qué se queda en el dispositivo

| Dato | ¿Va a PostgreSQL? | Dónde vive | Qué pasa al cerrar sesión |
|---|---|---|---|
| Resoluciones (tiempo, penalización, scramble, fecha, borrados) | **Sí** | IndexedDB  PostgreSQL | Con todo confirmado, se borra la copia local |
| Intentos de entrenamiento (zona, caso, modo, algoritmo, tiempos, marcas, validación) | **Sí** | IndexedDB  PostgreSQL | Igual |
| Las "sesiones" del cronómetro | No hace falta: son los días de las resoluciones | (derivadas) | — |
| Progreso del almanaque (casos aprendidos), variantes personales, algoritmo preferido | **No** (por ahora) | IndexedDB, separado por cuenta | Se borra junto con el espacio de la cuenta |
| Ajustes de la app (decimales, inspección, meta diaria) | No | localStorage (por dispositivo) | Se conservan |
| Cola de operaciones pendientes y marcador de la última sincronización | No | IndexedDB, dentro del espacio de la cuenta | Si hay pendientes, se conserva |
| Sesión (token) | No | localStorage | Se borra |

> Lo que "no va a la base" no se pierde al iniciar sesión: el progreso del almanaque del invitado se fusiona con el de la cuenta. Pero **no se comparte entre dispositivos**; sincronizarlo requeriría modelos nuevos en el backend.

## Cómo se separan los datos

Cada espacio es una base IndexedDB distinta, así que lo del invitado y lo de cada cuenta **no pueden mezclarse** por un filtro mal puesto:

- `speedcube-timer` — tu base de siempre: el primer espacio de invitado.
- `speedcube-timer:acct:<id>` — una por cuenta.
- `speedcube-timer:guest:<n>` — un invitado nuevo y vacío, tras migrar o cerrar sesión.

## Qué pasa al registrarte o iniciar sesión siendo invitado

1. Se **sella** tu espacio de invitado (nadie más lo ve, ni se puede migrar a otra cuenta) y empieza uno nuevo y vacío.
2. En segundo plano, sus datos se **copian** a la cuenta conservando sus identificadores (no hay duplicados aunque se repita).
3. La cola los sube al servidor. Si la cuenta ya existía, el historial remoto se baja y se **fusiona** sin pisar nada.
4. **Solo cuando el servidor confirmó todos** los registros se borra el espacio sellado. Si alguno es rechazado, se conserva y el panel lo indica.

Si se corta a mitad (cerrar el navegador, perder la conexión), al volver continúa donde quedó.

## Qué pasa al cerrar sesión

- Se intenta sincronizar lo pendiente (hasta 10 s; "Cerrar sin esperar" omite la espera).
- **Todo confirmado**: se borra el espacio de la cuenta, se invalida la sesión en el servidor y queda un invitado vacío. Al volver a entrar, el historial se descarga de nuevo.
- **Algo sin confirmar** (sin conexión, error del servidor, migración a medias): **no se borra nada**. Los datos quedan en el espacio aislado de esa cuenta, se avisa en pantalla y se retoman al iniciar sesión con la misma cuenta. El siguiente invitado u otra cuenta no los ven.

## Sincronización

- Cada cambio local deja una entrada en una cola persistente (en la misma transacción que el dato).
- Se envía en lotes; el servidor responde por cada registro si lo **aceptó**, ya tenía uno **más reciente** (gana el más reciente según la hora del dispositivo) o lo **rechazó** con el motivo.
- Ante fallos de red, reintento con espera creciente: 2 s, 4 s, 8 s… hasta 5 min.
- Se dispara solo: al abrir, poco después de cada cambio, al volver la conexión, al volver a la pestaña y cada 30 s. No corre mientras un cronómetro está en marcha.
- Que haya conexión se decide por si las peticiones funcionan, no por `navigator.onLine`.
- Estados: **Local** (invitado), **Pendiente**, **Sincronizado**, **Error** (y Sin conexión, Sesión caducada).

## Seguridad

- El servidor decide de quién es cada registro; el cliente no puede indicarlo. Un identificador de otra cuenta se rechaza.
- Todas las rutas de datos exigen sesión; cada cuenta solo ve lo suyo.
- Los tokens se guardan en el servidor **con hash**, uno por dispositivo (cerrar sesión en uno no cierra los demás) y caducan (30 días por defecto).
- Registro, inicio de sesión, recuperación y Google tienen límite de intentos por IP.
- El inicio de sesión no revela si un usuario existe, ni la recuperación si un correo está registrado.
- Google **nunca se vincula en silencio** a una cuenta que ya existe con ese correo: se pide iniciar sesión con la contraseña y vincular desde el perfil.
- El token del navegador está en `localStorage` (necesario para funcionar sin conexión). Es el compromiso habitual de una app offline: protege tu equipo y no pegues código desconocido en la consola.

## Activar Google y el correo

- **Google** (opcional): pon `GOOGLE_CLIENT_ID` en `.env` (ver `.env.example`) y reconstruye con `docker compose up --build`. Sin él, el botón no aparece.
- **Recuperar contraseña**: por defecto el correo no se envía, se escribe en `docker compose logs backend` (copia ahí el enlace). Para enviarlo de verdad, configura `EMAIL_*`.
- Una cuenta creada por consola (`createsuperuser`) puede no tener correo y entra igual con su usuario y contraseña. Para poder
  recuperar la contraseña necesita uno: agrégalo en `/admin`.