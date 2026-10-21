# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versionado según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- Backend con Django, Django REST Framework y PostgreSQL en `backend/` (backend)
- Modelos `Session` y `Solve` con ids generados en el cliente, borrado lógico y fecha de última modificación (backend)
- API de sincronización: `POST /api/sync/` sube cambios en lote de forma idempotente y `GET /api/sync/?since=` devuelve los cambios desde una fecha, borrados incluidos (backend)
- Autenticación por token (`POST /api/auth/token/`) y datos separados por usuario (backend)
- Endpoint `GET /api/health/` para que el cliente compruebe si el servidor está al alcance (backend)
- Panel de administración de Django para revisar los datos (backend)
- Pruebas automáticas de la API (15), verificadas con SQLite y con PostgreSQL 16 (backend)
- Docker Compose con PostgreSQL 16 y el backend, con volumen persistente para los datos y puerto local de PostgreSQL configurable, 5433 por defecto (docker).
- Archivo `.env.example` con la configuración del entorno (docker)
- README raíz con instrucciones del backend y de la API (docs)

### Cambiado
- El frontend pasa a vivir en `frontend/` (refactor)
- `.gitignore` ampliado con archivos de Python (build)

## [0.1.0] - 2026-10-21

### Añadido
- Estructura inicial del proyecto con Vite y React (build)
- Cronómetro con máquina de estados: mantener Espacio (o tocar) hasta que se ponga verde y soltar para empezar; cualquier tecla o toque lo detiene; Esc cancela (timer)
- Inspección opcional de 15 s con +2 automático entre 15 y 17 s y DNF pasados los 17 s (timer)
- Generador de mezclas de 3x3 por movimientos aleatorios (20 movimientos, sin repetir cara ni patrón R L R) y registro de puzzles para añadir más (scramble)
- Estadísticas de sesión: cantidad, mejor, media, ao5, ao12, mejor ao5 y mejor ao12, con recorte WCA y manejo de DNF (stats)
- Persistencia de los tiempos en IndexedDB, detrás de una capa de almacenamiento intercambiable (storage)
- Lista de la sesión con penalizaciones +2 y DNF por tiempo, eliminación de tiempos y opción de borrar la sesión (ui)
- Ajustes de inspección y de decimales (2 o 3), guardados en el navegador (ui)
- Interfaz responsive con colores de stickers de cubo por estado y modo sin distracciones mientras corre el timer (ui)
- Carpeta `src/training/zones/` reservada para las zonas de entrenamiento (training)
- README con instrucciones de uso y estructura del proyecto (docs)
