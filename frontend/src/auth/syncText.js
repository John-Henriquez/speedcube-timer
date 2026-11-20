/**
 * Texto y tono del estado de sincronización, a partir del estado del servicio. Es una función pura para poder
 * probarla sin interfaz. Estados: local (invitado), pendiente, sincronizado, error (y sin conexión / sesión caducada).
 */
export function describeSync({ status, sessionExpired = false, syncState = 'idle', overview = null, migrations = [] }) {
  if (status !== 'account') {
    return { key: 'local', tone: 'muted', label: 'Local', detail: 'Invitado: tus datos están solo en este dispositivo.' };
  }
  if (sessionExpired) {
    return { key: 'expired', tone: 'bad', label: 'Sesión caducada', detail: 'Inicia sesión de nuevo para seguir sincronizando. Tus datos siguen guardados en este dispositivo.' };
  }
  const pending = overview?.pending ?? 0;
  const errors = overview?.error ?? 0;
  const migrating = migrations.filter((m) => m.status === 'copying' || m.status === 'uploading');
  if (errors > 0) {
    return { key: 'error', tone: 'bad', label: `${errors} con error`, detail: 'El servidor rechazó algunos registros. Siguen guardados en este dispositivo.' };
  }
  if (migrating.length > 0) {
    const left = migrating.reduce((sum, m) => sum + (m.remaining ?? 0), 0);
    return { key: 'migrating', tone: 'warn', label: 'Respaldando tus datos', detail: left > 0 ? `Quedan ${left} registros por confirmar en el servidor.` : 'Copiando tus datos de invitado a la cuenta…' };
  }
  if (pending > 0) {
    if (syncState === 'offline') {
      return { key: 'offline', tone: 'warn', label: `Sin conexión · ${pending} pendientes`, detail: 'Se subirán solos cuando vuelva la conexión.' };
    }
    return { key: 'pending', tone: 'warn', label: `${pending} pendientes`, detail: 'Se están enviando al servidor.' };
  }
  if (syncState === 'offline') return { key: 'offline', tone: 'warn', label: 'Sin conexión', detail: 'No hay cambios pendientes. Se actualizará al volver la conexión.' };
  if (syncState === 'error') return { key: 'error', tone: 'warn', label: 'Servidor con problemas', detail: 'No hay cambios pendientes. Se reintentará solo.' };
  // Sin ninguna sincronización correcta aún (p. ej. recién iniciada la sesión): todavía no se ha comprobado nada con el servidor.
  if (!overview?.lastSyncAt) return { key: 'syncing', tone: 'warn', label: 'Sincronizando…', detail: 'Comparando con el servidor y descargando tu historial.' };
  return { key: 'synced', tone: 'ok', label: 'Sincronizado', detail: 'Todo lo que hay aquí está respaldado en el servidor.' };
}

/** Hora corta "14:05" de una fecha ISO, o null. */
export function shortTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}