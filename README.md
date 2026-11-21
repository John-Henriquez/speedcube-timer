# Speedcube Timer

Timer web de speedcubing con zonas de entrenamiento, un almanaque de algoritmos CFOP

Funciona **offline-first**: todo se guarda primero en el dispositivo. Sin cuenta, nada sale del navegador; con cuenta,
además se respalda y sincroniza solo con el servidor.

> Proyecto en desarrollo activo. Qué existe, qué tiene limitaciones y qué está planificado: ver
> [Funcionalidades](#funcionalidades) y [Estado y versiones](#estado-y-versiones).

## Propósito

Cronometrar resoluciones y, sobre todo, **practicar de forma medible**: aislar una fase del método CFOP (cruz, F2L, OLL,
PLL), registrar cada intento y ver el progreso por zona y por caso, con la base de datos como respaldo de lo practicado.

## Funcionalidades

**Disponibles**

- **Timer**: mantener Espacio (o tocar) para preparar, soltar para empezar; inspección opcional de 15 s (+2 entre 15 y
  17 s, DNF después); penalizaciones +2 y DNF; estadísticas de sesión (mejor, media, ao5, ao12 y sus mejores, con recorte
  WCA); ajustes de inspección, decimales (2 o 3), vista del cubo y meta diaria.
- **Calendario**: resoluciones por día, resumen mensual y barra de meta diaria.
- **Entrenamiento**: cinco zonas (Cross, Cross + primer par, F2L con cruz resuelta, OLL aislado, PLL aislado). Cada intento
  se registra en modo *Ejecución* (cronometrado) o *Conocimiento* ("lo sé / no lo sé"); la solución se comprueba con un
  simulador del cubo. Estadísticas por zona y por caso, y un Post-it con los últimos intentos del caso, de 5 en 5.
- **Almanaque CFOP**: los 57 casos OLL y los 21 PLL con diagrama y algoritmos, con su nivel de verificación (contrastado
  con dos fuentes o de una sola fuente). Estado por caso (pendiente, aprendiendo, en progreso, dominado), cobertura,
  variantes personales y algoritmo preferido.
+- **Cuentas y sincronización**: registro, inicio y cierre de sesión, recuperación de contraseña, perfil, sincronización
 automática y migración de lo hecho como invitado. Detalle en [docs/cuentas.md](docs/cuentas.md).
- **Interfaz** con tema retro 8-bit, responsive.
- **Docker**: frontend, backend y PostgreSQL con un solo comando.

**Con limitaciones** (existen, pero conviene saberlo)

- Solo hay 3x3. Las mezclas son de movimientos aleatorios (20, sin repetir cara), no de estado aleatorio: sirven para
  practicar, no equivalen a las de competencia.
- El progreso del almanaque, las variantes personales y los ajustes **no se sincronizan**: viven solo en el dispositivo.
- El backend corre con el servidor de desarrollo de Django y sin HTTPS: está pensado para la red local de casa. No abras
  el puerto 8000 a internet; si necesitas acceso desde fuera, usa una VPN.

**Experimentales** (implementados, sin validar en condiciones reales)

- Inicio de sesión con Google: probado con simulaciones; falta validarlo con credenciales reales de Google.
- Envío de correos de recuperación por SMTP: por defecto los correos no se envían, se escriben en los registros del
  backend; el envío real no está probado.

**Planificado** (no implementado)

- Versión 0.11.0: refactor estructural (alcance por definir).
- Separación avanzada de rutas y permisos.
- Post-it avanzado, refactor visual, entrenador adaptativo, dominio dinámico, Slow Turning e informes.
- Premium, pagos y restricciones por niveles: aplazados; no existe nada de esto.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 18, Vite 5, IndexedDB; fuentes locales con `@fontsource` |
| Backend | Python 3.12, Django 5, Django REST Framework 3, django-cors-headers, psycopg 3, google-auth |
| Base de datos | PostgreSQL 16 (SQLite solo para desarrollar sin Docker) |
| Infraestructura | Docker Compose; el frontend compilado se sirve con nginx |
| Pruebas | `node:test` + `fake-indexeddb` (frontend); pruebas de Django (backend) |

## Arquitectura

```
Navegador ─ React + IndexedDB (un espacio de datos por invitado y por cuenta, con cola de envío)
    │  HTTP, con un token por dispositivo
Backend ─── Django + DRF   /api/auth/*  /api/sync/  /api/health/  /admin/
    │
PostgreSQL ─ volumen `pgdata`
```

- **Offline-first**: el navegador es siempre la copia de trabajo. Con cuenta, PostgreSQL es la fuente de verdad.
- **El servidor decide la propiedad** de cada registro; el cliente nunca indica de quién es.
- **Sincronización idempotente**: los identificadores los genera el cliente (UUID), así que reenviar no duplica. Los
  borrados son lógicos (`deleted_at`) para que otros dispositivos se enteren. Si dos dispositivos editan lo mismo, gana la
  edición más reciente según la hora del dispositivo.

## Estructura del repositorio

```
speedcube-timer/
├── frontend/                 # app web (Vite + React)
│   ├── Dockerfile, nginx.conf
│   └── src/
│       ├── core/             # lógica pura, sin React: timer, estadísticas, mezclas, calendario, simulador del cubo
│       ├── catalog/          # almanaque: 57 OLL y 21 PLL con sus algoritmos y su verificación
│       ├── training/         # zonas de entrenamiento, intentos, selección y estadísticas
│       ├── storage/          # persistencia local: espacios IndexedDB (invitado / cuenta) y cola de envío
│       ├── sync/             # motor de sincronización automática y migración de invitado a cuenta
│       ├── auth/             # servicio de cuentas, cliente de la API y contexto de React
│       ├── hooks/, components/, pages/
│       └── testing/          # servidor simulado para las pruebas (no entra en el build)
├── backend/                  # API (Django + DRF)
│   ├── config/               # ajustes y rutas
│   ├── accounts/             # usuarios, sesiones por dispositivo, Google, recuperación de contraseña
│   └── timer/                # resoluciones, intentos, sesiones y /api/sync/
├── docs/                     # guías especializadas (ver "Documentación")
├── docker-compose.yml
├── .env.example
└── CHANGELOG.md
```

## Requisitos
- **Para ejecutar todo**: Docker Desktop (con Docker Compose v2).
- **Para desarrollar el frontend fuera de Docker**: Node.js 18 o superior (Vite 5 lo exige; la imagen de Docker y las
  pruebas usan Node 22).
- **Para el backend fuera de Docker** (opcional): Python 3.12.

## Variables de entorno

```bash
cp .env.example .env     # solo la primera vez; edita la contraseña y la clave secreta
```

`.env.example` documenta cada variable. En resumen:

| Grupo | Variables |
|---|---|
| Base de datos | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_HOST_PORT` |
| Django | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` |
| Cuentas | `AUTH_TOKEN_TTL_DAYS`, `AUTH_THROTTLE_RATE`, `FRONTEND_URL`, `VITE_API_URL` |
| Google (opcional) | `GOOGLE_CLIENT_ID` |
| Correo (opcional) | `EMAIL_BACKEND` y, para SMTP, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` |

`.env` no se sube a git. `GOOGLE_CLIENT_ID` y `VITE_API_URL` se incorporan al compilar el frontend: si los cambias,
reconstruye con `--build`.

## Levantar el proyecto con Docker

```bash
cp .env.example .env         # si aún no lo hiciste
docker compose up --build    # primera vez o tras cambiar código; la primera compilación tarda unos minutos
docker compose down          # detiene todo; NO borra los datos
```

Abre http://localhost:5173. Para el panel de administración, crea un administrador una vez:
`docker compose exec backend python manage.py createsuperuser` (los usuarios normales se registran en la app).

**Nunca uses `docker compose down -v`**: la `-v` borra el volumen con tus datos. Copia de seguridad, restauración, uso
desde el celular y solución de problemas: [docs/docker.md](docs/docker.md).

## Puertos y servicios

| Servicio | Qué es | Puerto del PC |
|---|---|---|
| `frontend` | app compilada, servida con nginx | 5173 |
| `backend` | API de Django (admin en `/admin/`) | 8000 |
| `db` | PostgreSQL 16, solo accesible desde este equipo | 5433 (`DB_HOST_PORT`) |

Orden de arranque: `db` → `backend` (aplica las migraciones al iniciar) → `frontend`, cada uno con su comprobación de
salud. Los datos de PostgreSQL viven en el volumen `pgdata`.

## Comandos habituales

**Frontend** (desde `frontend/`)

```bash
npm install
npm run dev        # servidor de desarrollo con recarga, en :5173
npm run build      # build de producción en dist/
npm run preview    # previsualizar el build
node --test        # pruebas (el proyecto no define `npm test`)
```
El servidor de desarrollo y el contenedor `frontend` usan el mismo puerto 5173: no los ejecutes a la vez. Para desarrollar
con recarga instantánea, deja solo la base de datos y el backend en Docker: `docker compose up -d db backend`.

**Backend**

```bash
docker compose exec backend python manage.py test               # pruebas
docker compose exec backend python manage.py makemigrations     # tras cambiar modelos
docker compose exec backend python manage.py migrate            # también se aplican solas al iniciar
docker compose logs -f backend                                  # registros (incluye los correos de recuperación)
```

Sin Docker, desde `backend/` (PowerShell): `$env:DJANGO_DEBUG = "1"; python manage.py test`. Sin `POSTGRES_DB` usa SQLite;
sin `DJANGO_DEBUG=1` exige definir `DJANGO_SECRET_KEY`.

## Frontend

Controles del timer:

| Acción | Teclado | Táctil / ratón |
|---|---|---|
| Preparar | Mantener Espacio hasta que se ponga verde | Mantener pulsada el área del timer |
| Empezar | Soltar Espacio | Soltar |
| Detener | Cualquier tecla | Tocar en cualquier parte |
| Cancelar | Esc | — |

Con la inspección activada: primero mantener y soltar para iniciar la inspección, y luego mantener y soltar de nuevo para
empezar a resolver.

Las pruebas viven junto al código (`*.test.js`). `core/` no depende de React: los hooks conectan esa lógica y el
almacenamiento con la interfaz. Las zonas de entrenamiento se definen en `training/zones/index.js`.

## Backend

Dos apps de Django: `accounts` (registro, sesiones por dispositivo, Google, recuperación de contraseña, perfil) y `timer`
(resoluciones, intentos, sesiones y la sincronización). Referencia de rutas y del contrato de sincronización:
[docs/api.md](docs/api.md).

## Cuentas y funcionamiento offline

| | Invitado | Con cuenta |
|---|---|---|
| Dónde se guardan los datos | Solo en el navegador | Navegador (copia de trabajo) y PostgreSQL (fuente de verdad) |
| Red | No se usa | Sincronización automática |
| Sin conexión | Todo funciona | Todo funciona; lo nuevo espera en una cola persistente y se sube al volver la conexión |

Al registrarte o iniciar sesión, lo que hiciste como invitado se migra a la cuenta sin duplicarse y solo se borra del
dispositivo cuando el servidor lo confirmó. Al cerrar sesión, si algo no pudo respaldarse, se conserva aislado para esa
cuenta y se avisa. Los datos del navegador se guardan **por origen** (`http://localhost:5173`): cambiar de puerto o de
dirección parecería perder los datos. Todo el detalle, incluido qué se envía a la base y qué se queda local:
[docs/cuentas.md](docs/cuentas.md).

## Estado y versiones

- Se sigue [SemVer](https://semver.org/lang/es/) y [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El
  historial completo está en [CHANGELOG.md](CHANGELOG.md).
- La versión vigente se lee en `frontend/package.json` (única fuente) y se muestra en el pie de la app.
- Un `feat` sube la versión MINOR, un `fix` la PATCH; `build`, `docs` y `refactor` no suben versión y se acumulan en
  "Sin publicar".
- Para publicar una versión: `npm version X.Y.Z --no-git-tag-version` en `frontend/`, cambiar el encabezado "Sin publicar"
  del CHANGELOG, commit `chore(release)`, etiqueta anotada `vX.Y.Z` y `git push --follow-tags`.
- Siguiente hito: 0.11.0 (refactor estructural).

## Para contribuir o continuar

- **Un cambio, un propósito**, con su entrada de CHANGELOG en el mismo cambio. Commits `tipo(ámbito): descripción`, en
  español. (Las reglas completas del proyecto se mantienen fuera del repositorio; esto es el resumen.)
- Antes de dar algo por terminado: `node --test` y `npm run build` en `frontend/`, y las pruebas del backend.
- El frontend accede a los datos **solo** por `storage/` (la fachada `storage/index.js`); no abras IndexedDB directamente.
  Cada invitado y cada cuenta tienen su propia base: esa separación es lo que impide mezclar datos.
- No cambies cómo se generan los identificadores de los registros (UUID en el cliente): la idempotencia depende de ello.
- El contrato de `/api/sync/` lo consumen el motor de sincronización y sus pruebas: cambiarlo exige tocar ambos lados.
- No modifiques `core/cube/` ni `catalog/` sin ejecutar las pruebas: verifican los algoritmos del almanaque con el
  simulador.
- No edites migraciones ya aplicadas; comprueba con `makemigrations --check`.
- Hay un único README, este. Lo extenso va a `docs/`; no crees README secundarios.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/docker.md](docs/docker.md) | Docker en detalle: datos y volumen, copia de seguridad, uso desde el celular, problemas frecuentes |
| [docs/cuentas.md](docs/cuentas.md) | Cuentas, qué va a la base y qué es local, migración, cierre de sesión, seguridad, Google y correo |
| [docs/api.md](docs/api.md) | Rutas de la API y contrato de sincronización |
| [CHANGELOG.md](CHANGELOG.md) | Historial de versiones |
