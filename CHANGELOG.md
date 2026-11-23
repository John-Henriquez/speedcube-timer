# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versionado según [SemVer](https://semver.org/lang/es/).

## [0.11.0] - 2026-11-22

### Añadido
- Soporte de inspección (`inspection_ms`) y de marcas de etapa (`marks`) en resoluciones e intentos (backend)
- Guía `docs/modelo-de-datos.md` y procedimiento para reconstruir la base en `docs/docker.md` (docs)

### Cambiado
- Modelo de usuario propio con correo y usuario únicos garantizados por la base; `Profile` se integra en `User` (backend)
- Integridad en PostgreSQL: `CHECK`, `UNIQUE` y clave compuesta que impide asociar una resolución a la sesión de otra cuenta (backend)
- `ended_at` e `inspection_ms` unifican `solved_at`/`attempted_at` y `recognition_ms` en el esquema; la API conserva los nombres anteriores (backend)
- Las migraciones de `accounts` y `timer` se reinician: una base anterior debe reconstruirse (backend)

### Eliminado
- `Profile`, la tabla `authtoken_token`, `first_name`/`last_name`, `Session.puzzle`, `created_at` y los campos `moves` y `stage_marks` (backend)

### Añadido
- Referencia de la API en `docs/api.md`, con el contrato de sincronización (docs)

### Cambiado
- README unificado en la raíz: funcionalidades por estado, arquitectura, Docker, comandos y guía para continuar (docs)
- `docs/docker.md` actualizado tras el sistema de cuentas (docs)

### Eliminado
- `frontend/README.md`, integrado en el README principal (docs)

## [0.10.0] - 2026-11-20

### Añadido
- Cuentas: registro, inicio y cierre de sesión, y recuperación de contraseña por correo (auth)
- Inicio de sesión con Google, opcional; no se vincula en silencio a cuentas existentes (auth)
- Panel de cuenta con perfil, seguridad, estado de sincronización, pendientes y errores (auth)
- Un espacio de datos aislado por cuenta y por invitado, en bases IndexedDB separadas (storage)
- Cola persistente de operaciones con reintentos de espera creciente y sincronización automática (sync)
- Migración de invitado a cuenta nueva o existente: idempotente, reanudable y sin borrar lo local hasta confirmar (sync)
- Cierre de sesión que conserva aislados los datos sin respaldar y avisa del estado real (auth)
- Sesiones por dispositivo con token guardado con hash, caducidad y límite de intentos por IP (backend)
- Guía `docs/cuentas.md` (docs)

### Cambiado
- La sincronización acepta o rechaza cada registro por separado y responde cuál ganó (backend)
- Los conflictos los decide la hora de edición del dispositivo, no el orden de llegada (backend)
- La sincronización manual se sustituye por la automática (sync)
- Se retira `/api/auth/token/` (backend)

## [0.9.2] - 2026-11-13

### Añadido
- Sistema centralizado de variables CSS para colores, tipografías, superficies, bordes y sombras (ui)
- Hojas de estilos independientes para controles, timer, mezclas, estadísticas, sesiones, ajustes, meta diaria y calendario (ui)
- Estilos independientes para el cubo, sincronización, entrenamiento y panel post-it, facilitando su mantenimiento y reutilización (ui)

### Cambiado
- Renovación visual de la interfaz hacia un diseño minimalista moderno, con jerarquía visual más clara, bordes sutiles y superficies diferenciadas (ui)
- Tipografías Manrope, Inter e IBM Plex Mono para encabezados, interfaz y datos numéricos (ui)
- Paleta semántica y diferenciación visual de las secciones Timer/Calendario y Entrenamiento/Almanaque (ui)
- Reorganización de los estilos del calendario y los componentes de entrenamiento y Almanaque CFOP (ui)
- Ajustes responsive en las vistas y componentes refactorizados (ui)

## [0.9.1] - 2026-11-02
### Añadido
- Servicio `frontend` en Docker Compose (compilado con Vite y servido con nginx en el puerto 5173), de modo que toda la aplicación se inicia con `docker compose up --build` (docker)
- Healthcheck del backend y del frontend, con arranque ordenado `db → backend → frontend` (docker)
- `.dockerignore` del frontend y del backend, para no copiar `node_modules` ni archivos locales a las imágenes (docker)
- Guía `docs/docker.md` con uso diario, copia de seguridad y restauración, y solución de problemas (docs)
- Variable `CSRF_TRUSTED_ORIGINS` y pruebas de la configuración del backend (backend)

### Cambiado
- El backend aplica las migraciones con `--noinput` y se detiene más rápido al apagar (docker)
- `localhost` y `127.0.0.1` quedan siempre permitidos en `ALLOWED_HOSTS`, para que el healthcheck no dependa del `.env` (backend)
- `.env.example` reúne y documenta toda la configuración (docker)

## [0.9.0] - 2026-11-02
### Añadido
- Simulador geométrico del cubo con toda la notación (giros, anchos, capas y rotaciones) y analizador de notación, contrastado con el modelo de piezas anterior (core)
- Conversión de cualquier algoritmo a giros de cara equivalentes, comprobada con 600 secuencias aleatorias (core)
- Catálogo CFOP como única fuente de datos: 57 OLL y 21 PLL, con 159 algoritmos verificados de tres fuentes y el estado de verificación calculado por el simulador (catalog)
- Categorías de OLL por aristas (Dot 8, Mini L 27, Line 15, Cross 7), de PLL por tipo de permutación, y familias visuales de OLL, todas calculadas y comprobadas (catalog)
- Comprobación de completitud: los 57 OLL cubren los 216 estados de orientación y los 21 PLL las 288 permutaciones (catalog)
- Almanaque CFOP con pestañas OLL y PLL, diagramas de última capa, filtros, búsqueda, cobertura y ficha de cada caso (ui)
- Estados de aprendizaje por caso y variantes personales, que solo se guardan si el simulador confirma que resuelven ese caso (ui)
- Entrenamiento de los 57 OLL y 21 PLL con filtros por categoría y estado de aprendizaje, modo cobertura y elección de algoritmo (training)
- Panel post-it con los últimos intentos del caso actual, de 5 en 5, con DNF, restaurar y borrar (training)
- Estadísticas de cobertura calculadas con los registros reales (training)

### Cambiado
- Los casos del entrenamiento salen del catálogo central en vez de una lista propia de 12 (training)
- Los intentos hechos con los identificadores antiguos pasan solos a los casos estándar, sin perder tiempos ni historial (training)
- Las mezclas de OLL y PLL se generan como giros de cara equivalentes al algoritmo (training)
- La tabla de estadísticas de OLL y PLL lista todos los casos, practicados o no (ui)
- El almanaque y el entrenamiento usan un ancho de página mayor (ui)

### Corregido
- Se sustituyen los nombres propios de la primera versión del entrenador (como "Línea" y "L") por los números estándar de OLL (training)

## [0.8.0] - 2026-11-02
### Añadido
- Los intentos de entrenamiento guardan una copia del algoritmo usado, para que cambiar después el recomendado no altere el historial (training)
- Campos `algorithm_id` y `algorithm_notation` en el modelo `Attempt` del backend, con la migración `0003`, y su traducción en la sincronización (backend)
- Pruebas del backend y de la sincronización para el algoritmo usado (backend)

[Sin publicar] por ## [0.7.0] - 2026-10-24

### Añadido
- Tema retro 8-bit con tipografía pixel art: Silkscreen en las etiquetas, Press Start 2P en los dígitos del timer y VT323 en el texto (ui)
- Paleta generada desde un único tono: azul en timer y calendario y su opuesto exacto, naranja, en el entrenamiento (ui)
- Barra de meta por segmentos, como una barra de vida (ui)
- Fuentes incluidas en la app, sin depender de internet (ui)

### Cambiado
- Timer despejado: meta, mezcla y cronómetro a la vista; ajustes tras un botón y sesión de hoy plegada con un resumen de una línea (ui)
- "Mostrar cubo" pasa a ser el botón "Cubo", junto a la mezcla, apagado por defecto (ui)
- Con el timer corriendo se ocultan también los botones de la mezcla (ui)
- Cubo, calendario, entrenamiento y sincronización unificados con el nuevo tema (ui)

### Eliminado
- Enlaces a Google Fonts (ui)

## [0.6.0] - 2026-10-23

### Añadido
- Sección Entrenamiento con las cinco zonas, práctica con mezcla y cubo, y apariencia propia (ui)
- Modalidades de ejecución y conocimiento en OLL y PLL, con elección de caso (ui)
- Estadísticas por zona y por caso con aviso de datos insuficientes (ui)
- Confirmación manual del resultado de cada intento, distinguida de la medición del timer (ui)
- Pruebas de las estadísticas por zona y por caso (training)

## [0.5.0] - 2026-10-23

### Añadido
- Navegación por secciones (Timer, Calendario) (ui)
- Calendario mensual: cada día es una sesión, con intensidad según la meta, resumen del mes y detalle del día (ui)
- Meta diaria de resoluciones con barra de progreso y porcentaje, configurable en los ajustes (ui)
- Lógica de días y calendario en hora local, con pruebas en varias zonas horarias (core)

### Cambiado
- El timer trabaja con la sesión de hoy: estadísticas, lista y "Borrar hoy" solo afectan al día (ui)
- Los controles del cronómetro pasan a un hook compartido (hooks)

## [0.4.0] - 2026-10-22

### Añadido
- Vista del cubo mezclado: isométrica y desarrollo plano de las seis caras (ui)
- Conversión del modelo de piezas a pegatinas por cara y geometría de dibujo (core)
- Opción para mostrar u ocultar el cubo en los ajustes (ui)
- Pruebas físicas de los seis giros y de que OLL y PLL se ven correctos en la cara superior (core)

## [0.3.0] - 2026-10-22
### Añadido
- Cliente de sincronización: sube lo modificado y baja lo nuevo, con reintento seguro y sin pisar ediciones locales recientes (sync)
- Panel de sincronización en la interfaz, con conexión por usuario y contraseña y sincronización automática (ui)
- Traducción entre el formato local y el de la API para resoluciones e intentos (sync)
- Pruebas del cliente con un servidor simulado, incluidos los casos sin conexión, sesión caducada y edición concurrente (sync)

### Cambiado
- Los hooks de resoluciones e intentos se recargan solos cuando una sincronización trae datos nuevos (hooks)
- El almacenamiento local distingue los registros bajados del servidor de los cambios locales pendientes (storage)

## [0.2.0] - 2026-10-22

### Añadido
- Modelo `Attempt` en el backend y soporte de `attempts` en la API de sincronización (backend)
- Persistencia local de intentos de entrenamiento y hook `useAttempts` (storage)
- Borrado lógico y marca `updatedAt` en el almacenamiento local, y `getChanges` para sincronizar solo lo modificado (storage)
- Pruebas de la capa de almacenamiento, incluida la migración de la v1 a la v2 (storage)

### Cambiado
- IndexedDB pasa a la versión 2, con tiendas `attempts` y `meta` (storage)
- Borrar resoluciones ahora es un borrado lógico (storage)

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
