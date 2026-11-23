from django.db import migrations

CONSTRAINT = 'timer_solve_session_same_user_fk'

LEGACY_MESSAGE = (
    'Esta base de datos tiene el esquema anterior a la versión 0.11.0 y no se puede actualizar en sitio: cambió el '
    'modelo de usuario y se reorganizaron las tablas. Hay que reconstruirla desde cero. Con Docker: '
    '"docker compose down -v" y luego "docker compose up --build" (esto BORRA los datos; si necesitas conservar algo, '
    'haz antes una copia de seguridad: ver docs/docker.md). Después, crea de nuevo el administrador con '
    '"docker compose exec backend python manage.py createsuperuser".'
)


def refuse_legacy_schema(apps, schema_editor):
    """
    Una base creada con el esquema anterior tiene registradas migraciones con los mismos nombres (accounts.0001 y
    timer.0001), así que Django las da por aplicadas aunque las tablas sean otras y esta migración fallaría con un
    error incomprensible. Se detecta aquí y se explica qué hacer.
    """
    connection = schema_editor.connection
    tables = set(connection.introspection.table_names())
    legacy_tables = {'accounts_profile', 'auth_user', 'authtoken_token'} & tables
    legacy_column = False
    if 'timer_solve' in tables:
        with connection.cursor() as cursor:
            legacy_column = any(c.name == 'solved_at' for c in connection.introspection.get_table_description(cursor, 'timer_solve'))
    if legacy_tables or legacy_column:
        raise RuntimeError(LEGACY_MESSAGE)


def add_constraint(apps, schema_editor):
    """
    Clave foránea COMPUESTA: una resolución solo puede apuntar a una sesión del MISMO usuario. Django no sabe
    expresar claves foráneas compuestas, así que se crea aquí, a mano. Solo en PostgreSQL (la base real); en SQLite
    (solo para desarrollar sin Docker) queda la validación del serializador.

    MATCH SIMPLE (por defecto): sin sesión (session_id NULL) no se comprueba nada.
    DEFERRABLE INITIALLY DEFERRED: la sincronización puede insertar sesión y resolución en el mismo envío, en
    cualquier orden. ON DELETE SET NULL (session_id) pone a NULL solo la sesión, sin tocar user_id; requiere PostgreSQL
    15 o superior (antes se omite la acción y el ORM de Django hace el SET_NULL).
    """
    connection = schema_editor.connection
    if connection.vendor != 'postgresql':
        return
    on_delete = ' ON DELETE SET NULL (session_id)' if connection.pg_version >= 150000 else ''
    schema_editor.execute(
        f'ALTER TABLE timer_solve ADD CONSTRAINT {CONSTRAINT} FOREIGN KEY (session_id, user_id) '
        f'REFERENCES timer_session (id, user_id){on_delete} DEFERRABLE INITIALLY DEFERRED'
    )


def drop_constraint(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(f'ALTER TABLE timer_solve DROP CONSTRAINT {CONSTRAINT}')


class Migration(migrations.Migration):
    dependencies = [('timer', '0001_initial')]
    operations = [
        migrations.RunPython(refuse_legacy_schema, migrations.RunPython.noop),
        migrations.RunPython(add_constraint, drop_constraint),
    ]