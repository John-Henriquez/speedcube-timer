# Modelo de datos

Esquema de PostgreSQL desde la versión 0.11.0. Este documento explica **qué hay, por qué y qué se decidió no modelar**.
Los modelos (con sus comentarios) están en `backend/accounts/models.py` y `backend/timer/models.py`.

## Principios

1. **Se guarda lo medido, se calcula lo demás.** Tiempos brutos, penalizaciones, fechas y marcas se persisten; promedios,
   mejores, duraciones por etapa, TPS y comparaciones entre períodos se calculan en la aplicación.
2. **La base de datos se defiende sola.** Las reglas que importan son `CHECK`, `UNIQUE` y claves foráneas, no solo
   validaciones: API, admin y consola quedan cubiertos por igual.
3. **Hecho para trabajar sin conexión.** Los registros nacen en el cliente: UUID propios, borrado lógico y hora de edición
   del dispositivo.

## Entidades

```
User ─┬─ 0..1 GoogleIdentity
      ├─ * AuthToken                      (una sesión por dispositivo)
      ├─ * Session ─── * Solve ─── * SolveMark       (la sesión de una resolución es opcional)
      ├─ * Solve        (con o sin sesión)
      └─ * Attempt ─── * AttemptMark                 (independiente de Solve y de Session)
```

| Entidad | Responsabilidad | Campos principales |
|---|---|---|
| `User` | La cuenta. Un administrador es un usuario con `is_staff` / `is_superuser`; no hay roles propios. | `username`, `email` (opcional), `display_name`, `password` y los campos estándar de Django |
| `GoogleIdentity` | La cuenta de Google vinculada (como máximo una por usuario). | `user` (1:1), `sub` (único), `email` |
| `AuthToken` | Una sesión de acceso por dispositivo. Solo se guarda el hash del token. | `user`, `key_hash` (único), `created_at`, `last_used_at`, `device` |
| `Session` | Agrupa resoluciones. | `id`, `user`, `name` |
| `Solve` | Una resolución convencional. | `id`, `user`, `session?`, `puzzle`, `time_ms`, `penalty?`, `scramble`, `inspection_ms?`, `ended_at` |
| `SolveMark` | Fin de una etapa de una resolución. | `solve`, `stage`, `elapsed_ms` |
| `Attempt` | Un intento de entrenamiento (Cross, F2L, OLL, PLL, casos…). No es una resolución. | `id`, `user`, `zone`, `case_key?`, `mode`, `time_ms?`, `inspection_ms?`, `algorithm_ref?`, `algorithm_notation?`, `capture`, `validation`, `notes`, `protocol_version`, `scramble`, `ended_at` |
| `AttemptMark` | Fin de una etapa de un intento. | `attempt`, `stage`, `elapsed_ms` |

`Session`, `Solve` y `Attempt` comparten, además, `id` (UUID del cliente), `updated_at` (hora del servidor, cursor de la
sincronización), `client_updated_at` (hora del dispositivo, desempata conflictos) y `deleted_at` (borrado lógico).

**¿Por qué `Solve` y `Attempt` siguen separados?** Representan cosas distintas. Una resolución es un resultado de
cronometraje con semántica WCA (penalizaciones, sesión). Un intento es un ejercicio sobre una zona o caso: no tiene
penalización ni sesión, puede ser de conocimiento (sin tiempo) y guarda el algoritmo usado y su validación. Lo común se
comparte en el código (clases abstractas `SyncedRecord` y `TimedRun`), no en una tabla única con la mitad de las columnas
vacías.

## Semántica temporal

```
        inspección                    ejecución
 |-----------------|-------------------------------------|
 inicio de          inicio de                              fin = ended_at
 inspección         ejecución = ended_at - time_ms
                    |-- cross --|-- f2l --|-- oll --|-- pll --|
                      marks: elapsed_ms desde el inicio de la ejecución
```

- `ended_at` es **la única marca absoluta** (UTC): el instante en que terminó la ejecución.
- `time_ms` es la duración de la ejecución, **sin penalización** (tiempo bruto). El efectivo se calcula.
- `inspection_ms` es la duración de la inspección (o del reconocimiento, en un intento) justo antes de empezar; `NULL` si no
  se midió.
- `marks` guardan el fin de cada etapa en milisegundos **desde el inicio de la ejecución**, nunca fechas absolutas.
- **Nada se guarda dos veces.** El inicio de ejecución (`ended_at - time_ms`), el inicio de inspección (`- inspection_ms`) y
  la duración de cada etapa (diferencia entre marcas consecutivas) se deducen.
- **La última etapa no tiene marca:** termina con la ejecución, así que su duración es `time_ms` menos la última marca.
- Las marcas aceptan resoluciones sin segmentar, segmentadas por completo o parcialmente, y **etapas distintas según la
  modalidad** (`cross`/`f2l`/`oll`/`pll`, `first-block`/`cmll`…): `stage` es un código libre, sin tabla de etapas ni migración
  al añadir una modalidad. Las validaciones que no caben en una restricción (que ninguna marca supere `time_ms`) las hace el
  serializador.

## Qué garantiza la base de datos

| Regla | Mecanismo |
|---|---|
| Usuario único sin distinguir mayúsculas | `UNIQUE (lower(username))` |
| Un correo, una cuenta (los vacíos no cuentan) y siempre en minúsculas | `UNIQUE (email) WHERE email <> ''` + `CHECK (email = lower(email))` |
| Una cuenta de Google por usuario y por identidad | `user` 1:1 y `sub` único |
| Una resolución solo puede apuntar a una sesión **del mismo usuario** | clave foránea compuesta `(session_id, user_id) → (id, user_id)` (migración `0002`, solo PostgreSQL) |
| Penalización solo `+2`, `DNF` o ninguna | `CHECK` |
| `mode`, `capture`, `validation` dentro de lo permitido | `CHECK` |
| Un intento de ejecución siempre tiene tiempo; uno de conocimiento puede no tenerlo | `CHECK` |
| Si se indica el algoritmo usado, se conserva su notación | `CHECK` |
| Tiempos, inspección y marcas entre 0 y 10 horas | `CHECK` |
| Una etapa no tiene dos marcas en la misma resolución o intento | `UNIQUE (parent, stage)` |
| Borrar un usuario borra todo lo suyo; borrar una resolución, sus marcas | `CASCADE` |
| Borrar una sesión conserva sus resoluciones, sin sesión | `SET NULL` (ORM y, en PostgreSQL 15+, también la base) |

La clave compuesta se crea a mano porque Django no sabe expresarla; en SQLite (solo para desarrollar sin Docker) esa regla
queda en el serializador. Requiere PostgreSQL 15 o superior para el `ON DELETE SET NULL (session_id)`; el `docker-compose.yml`
usa PostgreSQL 16.

## Índices

| Tabla | Índice | Para qué |
|---|---|---|
| `Session`, `Solve`, `Attempt` | `(user, updated_at)` | La consulta incremental de `/api/sync/` (lo nuevo desde la última vez) |
| `Solve` | `(user, ended_at)` | Historial, calendario y estadísticas por rango de fechas |
| `Attempt` | `(user, zone, case_key, ended_at)` | Estadísticas por zona y por caso en el tiempo (el prefijo `(user, zone)` sirve a las consultas por zona) |
| Marcas | `UNIQUE (parent, stage)` | Integridad y búsqueda de las marcas de un registro |
| `User`, `GoogleIdentity`, `AuthToken` | los `UNIQUE` de arriba | Inicio de sesión y autenticación por token |

Además de los índices automáticos de las claves foráneas. No se indexan `deleted_at`, `puzzle`, `penalty` ni `mode`: los
borrados lógicos viajan por la sincronización como el resto, y esos campos no se filtran solos sobre tablas grandes.

## Qué cambió respecto a la 0.10.0, y por qué

| Antes | Ahora | Por qué |
|---|---|---|
| `Profile` (tabla 1:1) con `email_key` | `display_name` en `User`; el correo único en `User` | Una tabla con dos campos útiles; `email_key` duplicaba `auth_user.email` solo para poder hacerlo único |
| Modelo de usuario estándar de Django | `accounts.User` propio | Es la única forma de tener `UNIQUE` de correo y usuario en la base; obliga a reiniciar las migraciones (ver abajo) |
| `first_name`, `last_name` | Eliminados | Nunca se usaron |
| Tabla `authtoken_token` | Eliminada | Sin uso desde 0.10.0 (`AuthToken` propio) |
| `GoogleIdentity` N:1, `sub` de 64 caracteres | 1:1, `sub` de 255 | Un usuario no tenía por qué tener varias, y Google permite hasta 255 caracteres |
| `Session.puzzle` y `Solve.puzzle` | Solo `Solve.puzzle` | El mismo dato dos veces, con riesgo de contradecirse |
| `created_at` en las tres tablas | Eliminado | Hora de recepción en el servidor: sin uso. `updated_at` basta para sincronizar |
| `client_updated_at` opcional | Obligatorio (por defecto, la hora de recepción) | Una columna con `NULL` complicaba cada comparación de conflictos |
| `solved_at` / `attempted_at` | `ended_at` en ambos | Significan lo mismo: cuándo terminó la ejecución |
| `recognition_ms` (intentos) | `inspection_ms` en ambos | La misma idea (tiempo observando antes de empezar), con un solo nombre y una sola consulta |
| `stage_marks` (JSON) y `moves` (JSON) | `SolveMark` / `AttemptMark`; `moves` eliminado | Nunca se rellenaron. Las marcas relacionadas permiten consultar y agregar por etapa; registrar cada movimiento no se necesita |
| `case_id`, `algorithm_id` | `case_key`, `algorithm_ref` | No son claves foráneas: el sufijo `_id` confundía |
| `algorithm_notation = ''` si no hay algoritmo | `NULL` | Una sola forma de decir "no hay" |
| Reglas solo en el serializador | `CHECK`, `UNIQUE` y clave compuesta | La integridad ya no depende del camino de escritura |
| Índice `(user, zone, attempted_at)` | `(user, zone, case_key, ended_at)` | Cubre también las consultas por caso |

## Qué no se modela (todavía) y por qué

- **El experimento de mejora** (línea base, entrenamiento, comparación): ni entidades ni métricas guardadas. Lo que sí hacen
  los datos es conservar todo lo necesario: tiempos brutos, fechas, inspección y marcas por etapa. Con eso, cualquier
  comparación entre períodos es una consulta, no una estructura nueva.
- **Promedios, mejores, desviaciones, TPS, duraciones por etapa y porcentajes de mejora:** se calculan.
- **El catálogo de casos y algoritmos:** son datos de referencia del cliente. Un intento guarda `case_key` y una copia de
  `algorithm_notation`, de modo que cambiar después el algoritmo recomendado no altera el historial.
- **El progreso por caso, las variantes personales y el algoritmo preferido:** hoy viven solo en el dispositivo. Sí son
  estado propio del usuario (no se puede reconstruir desde un único registro) y probablemente necesiten una tabla cuando se
  sincronicen; se decidirá junto con el cambio del frontend, porque el contrato de la API aún no los incluye.
- **Una entidad para invitados:** no existe; sus datos no salen del navegador.
- **Limpieza de borrados lógicos antiguos:** los registros con `deleted_at` se conservan. No es un problema con este
  volumen; si lo fuera, bastaría una tarea que purgue los más antiguos que cualquier dispositivo ya haya sincronizado.

## Migraciones

Cambiar el modelo de usuario obliga a que `accounts.0001_initial` cree el usuario (`admin`, `auth` y el resto dependen de
él), de modo que **no basta con añadir migraciones**: las de `accounts` se reiniciaron y, como `timer` depende de ellas, las de
`timer` también. Resultado: `accounts.0001` y `timer.0001` (el esquema) más `timer.0002` (la clave compuesta). El historial
anterior sigue en git. Una instalación limpia se construye con `migrate` sin pasos adicionales.

**Una base creada con el esquema anterior no se puede actualizar en sitio.** La migración `timer.0002` lo detecta y se
niega con un mensaje que explica qué hacer, en lugar de fallar con un error incomprensible. El procedimiento está en
[docker.md](docker.md#reconstruir-la-base-desde-cero).

## Compatibilidad con la API

El frontend no cambió en esta versión. Los serializadores traducen entre el esquema nuevo y el formato anterior (`solved_at`,
`attempted_at`, `case_id`, `algorithm_id`, `recognition_ms`), así que lo que el cliente envía y recibe es lo mismo. Lo nuevo
(`inspection_ms` en resoluciones y `marks` en resoluciones e intentos) es opcional: [api.md](api.md).