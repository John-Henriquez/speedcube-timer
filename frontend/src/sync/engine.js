import { EVENTS, emit } from './events.js';
import { attemptFromServer, attemptToServer, solveFromServer, solveToServer } from './mapping.js';

/**
 * Motor de sincronización de UN espacio con el servidor. `syncOnce()` hace un ciclo completo:
 *   1. SUBE la cola de operaciones pendientes, por lotes. El servidor responde por cada registro si lo aceptó,
 *      si ya tenía uno más reciente (se conserva el del servidor) o si lo rechazó (y por qué).
 *   2. BAJA los cambios nuevos del servidor, sin pisar lo que tenga cambios locales sin confirmar.
 * Ante un fallo de red, las entradas se reintentan con espera creciente (2 s, 4 s, 8 s... hasta 5 min). Que haya o
 * no conexión se decide por el resultado real de las peticiones, no por `navigator.onLine`.
 * Nunca lanza: devuelve { status: 'ok' | 'offline' | 'unauthorized' | 'error', pushed, stale, rejected, pulled }.
 */
export function createEngine({
  space, serverUrl, token, fetchImpl = (...args) => fetch(...args), now = Date.now, rng = Math.random,
  batchSize = 200, timeoutMs = 10000,
}) {
  const url = `${serverUrl}/api/sync/`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Token ${token}` };
  const jitter = () => 0.75 + rng() * 0.5;

  async function request(query = '', options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${url}${query}`, { ...options, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const keysOf = (pairs) => pairs.map((p) => p.entry.key);
  const transient = (status) => status >= 500 || status === 429 || status === 408;

  async function push({ force }) {
    const summary = { pushed: 0, stale: 0, rejected: 0 };
    for (;;) {
      const due = await space.dueEntries({ now: now(), limit: batchSize, force });
      if (!due.length) return { summary };
      const pairs = await space.recordsFor(due);
      // Si el registro ya no existe no hay nada que enviar: la entrada se cierra.
      await space.ackEntries(pairs.filter((p) => !p.record).map((p) => ({ key: p.entry.key, seq: p.entry.seq })));
      const sendable = pairs.filter((p) => p.record);
      if (!sendable.length) continue;

      const body = { solves: [], attempts: [] };
      for (const { entry, record } of sendable) {
        body[entry.store].push(entry.store === 'solves' ? solveToServer(record) : attemptToServer(record));
      }
      let res;
      try {
        res = await request('', { method: 'POST', body: JSON.stringify(body) });
      } catch {
        await space.failEntries(keysOf(sendable), 'Sin conexión con el servidor', { now: now(), jitter: jitter() });
        return { status: 'offline', summary };
      }
      if (res.status === 401 || res.status === 403) return { status: 'unauthorized', summary }; // no es culpa de los datos
      if (!res.ok) {
        const message = `El servidor respondió ${res.status}`;
        await space.failEntries(keysOf(sendable), message, { now: now(), jitter: jitter(), permanent: !transient(res.status) });
        return { status: 'error', message, summary };
      }

      const data = await res.json();
      const acks = [];
      const unconfirmed = [];
      for (const { entry } of sendable) {
        const { store: kind, id, key, seq } = entry;
        if (data.accepted?.[kind]?.includes(id)) {
          acks.push({ key, seq });
          summary.pushed += 1;
        } else if (data.stale?.[kind]?.includes(id)) {
          acks.push({ key, seq }); // el servidor tiene una versión más reciente: gana esa y llegará al bajar
          summary.stale += 1;
        } else if (data.rejected?.[kind]?.[id]) {
          await space.failEntries([key], JSON.stringify(data.rejected[kind][id]), { permanent: true });
          summary.rejected += 1;
        } else {
          unconfirmed.push(key);
        }
      }
      await space.ackEntries(acks);
      if (unconfirmed.length) await space.failEntries(unconfirmed, 'El servidor no confirmó el registro', { now: now(), jitter: jitter() });
    }
  }

  async function pull() {
    const since = await space.getMeta('serverCursor');
    let res;
    try {
      res = await request(since ? `?since=${encodeURIComponent(since)}` : '');
    } catch {
      return { status: 'offline' };
    }
    if (res.status === 401 || res.status === 403) return { status: 'unauthorized' };
    if (!res.ok) return { status: 'error', message: `El servidor respondió ${res.status}` };
    const data = await res.json();
    const solves = (data.solves ?? []).map(solveFromServer);
    const attempts = (data.attempts ?? []).map(attemptFromServer);
    await space.applyRemote({ solves, attempts });
    await space.setMeta('serverCursor', data.server_time);
    return { status: 'ok', pulled: solves.length + attempts.length };
  }

  async function remember(patch) {
    const current = (await space.getMeta('syncStatus')) ?? {};
    await space.setMeta('syncStatus', { ...current, ...patch });
  }

  return {
    space,

    async syncOnce({ force = false } = {}) {
      try {
        const up = await push({ force });
        if (up.status) {
          await remember({ lastAttemptAt: new Date(now()).toISOString(), lastError: up.message ?? up.status });
          return { ...up.summary, pulled: 0, status: up.status, message: up.message };
        }
        const down = await pull();
        if (down.status !== 'ok') {
          await remember({ lastAttemptAt: new Date(now()).toISOString(), lastError: down.message ?? down.status });
          return { ...up.summary, pulled: 0, status: down.status, message: down.message };
        }
        const at = new Date(now()).toISOString();
        await remember({ lastSyncAt: at, lastAttemptAt: at, lastError: null });
        if (down.pulled > 0) emit(EVENTS.DATA); // hay datos nuevos que mostrar
        return { ...up.summary, pulled: down.pulled, status: 'ok' };
      } catch (error) {
        return { pushed: 0, stale: 0, rejected: 0, pulled: 0, status: 'error', message: error.message };
      }
    },

    /** Resumen para la interfaz: pendientes, errores, próxima espera y última sincronización. */
    async overview() {
      const [stats, status] = await Promise.all([space.outboxStats(now()), space.getMeta('syncStatus')]);
      return { ...stats, lastSyncAt: status?.lastSyncAt ?? null, lastAttemptAt: status?.lastAttemptAt ?? null, lastError: stats.lastError ?? status?.lastError ?? null };
    },
  };
}