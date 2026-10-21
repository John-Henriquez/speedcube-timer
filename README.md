# Speedcube Timer

Timer web para speedcubing con zonas de entrenamiento y análisis de datos. Inspirado en Twisty Timer.

```
speedcube-timer/
├── frontend/            # app web (Vite + React); ver frontend/README.md
├── backend/             # API (Django + Django REST Framework)
├── docker-compose.yml   # PostgreSQL + backend
└── .env.example
```

La app funciona **offline-first**: el timer guarda en el dispositivo y sincroniza con el servidor cuando hay conexión.

## Backend con Docker

Requiere Docker con Compose.

```bash
cp .env.example .env          # edita las contraseñas y la clave secreta
docker compose up --build     # PostgreSQL en :5433 (solo local) y API en :8000
```

En otra terminal, la primera vez:

```bash
docker compose exec backend python manage.py createsuperuser
```

Pedir un token de acceso para el cliente:

```bash
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "TU_USUARIO", "password": "TU_CONTRASEÑA"}'
```

### API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health/` | Comprueba que el servidor responde (sin autenticación) |
| POST | `/api/auth/token/` | Obtiene el token de un usuario |
| GET | `/api/sync/?since=<fecha ISO>` | Cambios desde esa fecha, incluidos los borrados. Sin `since`, devuelve todo |
| POST | `/api/sync/` | Sube sesiones y resoluciones en lote (idempotente) |

Las peticiones a `/api/sync/` llevan el encabezado `Authorization: Token <token>`. Cada respuesta trae `server_time`: se guarda y se usa como `since` en la siguiente sincronización.

Los borrados son lógicos (`deleted_at`) para que los demás dispositivos se enteren. Si dos dispositivos editan lo mismo, gana la última escritura en llegar al servidor.

### Pruebas

```bash
docker compose exec backend python manage.py test
```

### Seguridad

El servidor está pensado para la red local de casa y usa HTTP sin cifrar. No abras el puerto 8000 a internet; si se necesita acceso desde fuera, usa una VPN.
