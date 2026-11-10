# Docker: toda la aplicación con un solo comando

Requisitos: Docker Desktop (con Docker Compose v2). Desde la raíz del repositorio:

```powershell
cp .env.example .env        # solo la primera vez; edita la contraseña y la clave secreta
docker compose up --build   # inicia todo (la primera vez compila el frontend y tarda unos minutos)
docker compose down         # detiene todo; NO borra los datos
```

Para volver a iniciar sin recompilar: `docker compose up`. Para dejarlo en segundo plano: `docker compose up -d`.

## Qué se ejecuta

| Servicio | Qué es | Dirección en el navegador | Puerto del PC |
|---|---|---|---|
| `frontend` | la aplicación compilada, servida con nginx | http://localhost:5173 | 5173 |
| `backend` | API de Django | http://localhost:8000 (admin en `/admin`) | 8000 |
| `db` | PostgreSQL 16 | solo para herramientas como DBeaver | 5433 (solo este PC) |

Dentro de Docker los servicios se llaman entre sí por su nombre (el backend usa `db:5432`). El navegador, en cambio, está
fuera de Docker: por eso usa `localhost`. En el panel "Sincronización" de la aplicación, el servidor es `http://localhost:8000`.

El frontend se sirve en el **5173**, el mismo puerto que usaba `npm run dev`. No es casual: los datos que solo viven en el
navegador (estado de aprendizaje, algoritmos propios, ajustes) se guardan **por origen** (`http://localhost:5173`); con otro
puerto parecerían perdidos.

## Configuración (`.env`)

Una sola configuración para todo, copiada de `.env.example`. El `.env` real no se sube a git.

| Variable | Para qué sirve |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | la base de datos |
| `DB_HOST_PORT` | puerto del PC para PostgreSQL (por defecto 5433; en Windows el 5432 suele estar ocupado) |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG` | Django |
| `DJANGO_ALLOWED_HOSTS` | nombres con los que se puede llamar al backend (`localhost` y `127.0.0.1` siempre se permiten) |
| `CORS_ALLOWED_ORIGINS` | páginas web autorizadas a usar la API |
| `CSRF_TRUSTED_ORIGINS` | solo para el formulario del `/admin`; casi nunca hay que tocarlo |

Para usarlo desde el celular en la misma red: agrega la IP del PC a `DJANGO_ALLOWED_HOSTS` (por ejemplo `192.168.1.50`) y
`http://192.168.1.50:5173` a `CORS_ALLOWED_ORIGINS`, y reinicia con `docker compose up -d`.

## Tus datos

PostgreSQL guarda todo en el volumen `pgdata` (en Docker aparece como `speedcube-timer_pgdata`: el nombre de la carpeta del
proyecto + `pgdata`). Ese volumen sobrevive a reiniciar contenedores, a reconstruir imágenes y a `docker compose down`.

**Lo que SÍ borra los datos:**
- `docker compose down -v` (la `-v` elimina los volúmenes). No lo uses como procedimiento habitual.
- Borrar el volumen desde Docker Desktop.
- Cambiar el nombre de la carpeta del proyecto o el nombre `pgdata` en `docker-compose.yml`: Docker crearía un volumen
  nuevo y vacío (el antiguo seguiría existiendo; bastaría con volver al nombre original).

Las migraciones se aplican solas al iniciar el backend (`migrate --noinput`): solo añaden lo que falta, nunca borran ni
reinician datos. Si una migración fallara, el backend no arranca y el error se ve con `docker compose logs backend`.
También se pueden ejecutar a mano: `docker compose run --rm backend python manage.py migrate`.

### Copia de seguridad y restauración

Antes de cambios grandes conviene hacer una copia (con la aplicación en marcha):

```powershell
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" -f /tmp/respaldo.dump'
docker compose cp db:/tmp/respaldo.dump ./respaldo.dump
```

Para restaurarla sobre la base actual:

```powershell
docker compose cp ./respaldo.dump db:/tmp/respaldo.dump
docker compose exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /tmp/respaldo.dump'
```

## Uso diario

| Quiero... | Comando |
|---|---|
| ver el estado y la salud de cada servicio | `docker compose ps` |
| ver los registros de un servicio | `docker compose logs -f backend` |
| crear un usuario para la sincronización | `docker compose exec backend python manage.py createsuperuser` |
| ejecutar las pruebas del backend | `docker compose exec backend python manage.py test` |
| ver cambios nuevos del frontend | `docker compose up -d --build frontend` |
| reiniciar un servicio | `docker compose restart backend` |

El código del backend está montado dentro del contenedor, así que sus cambios se recargan solos. El frontend, en cambio, es
la versión **compilada**: tras cambiar código hay que reconstruirlo con el comando de la tabla.

### Desarrollar el frontend con recarga instantánea

Deja corriendo solo la base de datos y el backend, y ejecuta el servidor de desarrollo de siempre (usa el mismo puerto
5173, por eso el contenedor `frontend` no debe estar iniciado):

```powershell
docker compose up -d db backend
cd frontend
npm run dev
```

## Si algo no funciona

- **El puerto 5173, 8000 o 5433 está ocupado**: algo más lo usa (por ejemplo `npm run dev` con el contenedor `frontend`).
  Detén uno de los dos. Para PostgreSQL cambia `DB_HOST_PORT` en `.env`.
- **El backend aparece `unhealthy`**: mira `docker compose logs backend`. Lo más común es una variable de `.env` mal escrita.
- **El frontend no inicia**: espera a que el backend esté `healthy`; el frontend depende de él a propósito, para que
  `docker compose ps` muestre un único estado "todo sano".
- **Parece que se perdieron los datos**: ejecuta `docker volume ls`. Si ves un volumen `..._pgdata` distinto del habitual,
  se cambió el nombre de la carpeta o del proyecto; vuelve al nombre original.