import { EVENTS, emit } from '../sync/events.js';

/**
 * Un "espacio" es una base de datos IndexedDB independiente: la del invitado o la de una cuenta. Al ser bases
 * distintas, lo de un espacio no puede aparecer en otro por un descuido de filtrado.
 *
 * En un espacio con `sync: true` (cuentas) cada escritura deja además una entrada en la COLA ("outbox"), dentro
 * de la misma transacción: o se guardan las dos cosas o ninguna. La cola es persistente (sobrevive a recargar la
 * página) y es lo que el motor de sincronización sube al servidor. Un registro sin entrada en la cola está
 * sincronizado; con entrada "pending" está pendiente; con entrada "error", el servidor lo rechazó.
 */
const VERSION = 3;
export const STORES = Object.freeze({ SOLVES: 'solves', ATTEMPTS: 'attempts', META: 'meta', OUTBOX: 'outbox' });
const DATA = [STORES.SOLVES, STORES.ATTEMPTS];

/** Marca de "viene del servidor": no cuenta como cambio local. */
export const SYNCED = '1970-01-01T00:00:00.000Z';

/** Espera antes de reintentar: 2 s, 4 s, 8 s... hasta un máximo de 5 min (`jitter` ~0,75-1,25 evita que todo reintente a la vez). */
export const backoffMs = (tries, jitter = 1) => Math.round(Math.min(300000, 2000 * 2 ** Math.max(0, tries - 1)) * jitter);

const nowIso = () => new Date().toISOString();

function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (const store of DATA) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.OUTBOX)) db.createObjectStore(STORES.OUTBOX, { keyPath: 'key' });
      // v1 -> v2 (la base original del invitado): las resoluciones ya guardadas reciben `updatedAt`.
      if (event.oldVersion === 1) {
        req.transaction.objectStore(STORES.SOLVES).openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const solve = cursor.value;
          if (!solve.updatedAt) cursor.update({ ...solve, updatedAt: solve.date, deletedAt: solve.deletedAt ?? null });
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const isRequest = (v) => v && typeof v === 'object' && 'readyState' in v && 'result' in v;

export function createSpace(name, { sync = false } = {}) {
  let dbPromise = null;
  // Un espacio cerrado o eliminado no se puede volver a abrir: así una llamada rezagada (p. ej. un ciclo de
  // sincronización que justo terminaba) falla rápido en vez de reabrir la base y dejar una conexión huérfana que
  // bloquearía su borrado.
  let ended = null;
  const getDb = () => {
    if (ended) return Promise.reject(new Error(`El espacio "${name}" ya está ${ended}`));
    return (dbPromise ??= openDb(name));
  };

  /** Ejecuta `fn` en una transacción; resuelve cuando se confirma, con el resultado (o el de la petición devuelta). */
  async function tx(stores, mode, fn) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      try {
        result = fn(t);
      } catch (error) {
        t.abort();
        reject(error);
        return;
      }
      t.oncomplete = () => resolve(isRequest(result) ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transacción cancelada'));
    });
  }
  const writeStores = (store) => (sync ? [store, STORES.OUTBOX] : [store]);

  /** Anota (o renueva) la entrada de la cola de un registro. `seq` sube con cada edición. */
  function enqueue(t, store, id, migrationId = null) {
    const outbox = t.objectStore(STORES.OUTBOX);
    const key = `${store}:${id}`;
    outbox.get(key).onsuccess = (e) => {
      const current = e.target.result;
      outbox.put({
        key, store, id, seq: (current?.seq ?? 0) + 1, queuedAt: current?.queuedAt ?? nowIso(),
        tries: 0, nextAttemptAt: 0, status: 'pending', lastError: null, migrationId: migrationId ?? current?.migrationId ?? null,
      });
    };
  }

  const listAll = (store) => tx([store], 'readonly', (t) => t.objectStore(store).getAll());
  const byDate = (a, b) => (a.date ?? '').localeCompare(b.date ?? '');
  const live = async (store) => (await listAll(store)).filter((r) => !r.deletedAt).sort(byDate);

  async function save(store, record) {
    const stored = { ...record, updatedAt: nowIso() };
    await tx(writeStores(store), 'readwrite', (t) => {
      t.objectStore(store).put(stored);
      if (sync) enqueue(t, store, stored.id);
    });
    if (sync) emit(EVENTS.LOCAL_CHANGE);
    return stored;
  }

  /** Borrado lógico: el registro queda con `deletedAt` para que el borrado también se sincronice. */
  async function softDelete(store, ids) {
    let changed = false;
    await tx(writeStores(store), 'readwrite', (t) => {
      const s = t.objectStore(store);
      const stamp = nowIso();
      for (const id of ids) {
        s.get(id).onsuccess = (e) => {
          const record = e.target.result;
          if (!record || record.deletedAt) return;
          s.put({ ...record, deletedAt: stamp, updatedAt: stamp });
          if (sync) enqueue(t, store, id);
          changed = true;
        };
      }
    });
    if (changed && sync) emit(EVENTS.LOCAL_CHANGE);
  }

  return {
    name,
    sync,

    getSolves: () => live(STORES.SOLVES),
    getAttempts: () => live(STORES.ATTEMPTS),
    saveSolve: (solve) => save(STORES.SOLVES, solve),
    saveAttempt: (attempt) => save(STORES.ATTEMPTS, attempt),
    deleteSolve: (id) => softDelete(STORES.SOLVES, [id]),
    deleteAttempt: (id) => softDelete(STORES.ATTEMPTS, [id]),
    async clearSolves() {
      await softDelete(STORES.SOLVES, (await live(STORES.SOLVES)).map((s) => s.id));
    },

    async getMeta(key) {
      const row = await tx([STORES.META], 'readonly', (t) => t.objectStore(STORES.META).get(key));
      return row ? row.value : null;
    },
    setMeta: (key, value) => tx([STORES.META], 'readwrite', (t) => { t.objectStore(STORES.META).put({ key, value }); }),

    /** Cuántos registros visibles hay (sin contar los borrados). */
    async count() {
      const [solves, attempts] = await Promise.all([live(STORES.SOLVES), live(STORES.ATTEMPTS)]);
      return { solves: solves.length, attempts: attempts.length, total: solves.length + attempts.length };
    },

    // ---------- Cola de operaciones pendientes ----------
    outboxEntries: () => listAll(STORES.OUTBOX),

    /** Entradas listas para enviarse: pendientes y cuya espera ya terminó (`force` ignora la espera). */
    async dueEntries({ now = Date.now(), limit = 200, force = false } = {}) {
      return (await listAll(STORES.OUTBOX))
        .filter((e) => e.status === 'pending' && (force || e.nextAttemptAt <= now))
        .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
        .slice(0, limit);
    },

    /** Lee el estado ACTUAL de los registros de esas entradas (puede haber cambiado desde que se encolaron). */
    recordsFor(entries) {
      return tx([STORES.SOLVES, STORES.ATTEMPTS], 'readonly', (t) => {
        const out = entries.map((entry) => ({ entry, record: null }));
        out.forEach((o) => {
          t.objectStore(o.entry.store).get(o.entry.id).onsuccess = (e) => { o.record = e.target.result ?? null; };
        });
        return out;
      });
    },

    /** Confirma entradas enviadas. Si el registro se editó mientras tanto (`seq` distinto), la entrada se conserva. */
    ackEntries(acks) {
      return tx([STORES.OUTBOX], 'readwrite', (t) => {
        const outbox = t.objectStore(STORES.OUTBOX);
        for (const { key, seq } of acks) {
          outbox.get(key).onsuccess = (e) => {
            if (e.target.result && e.target.result.seq === seq) outbox.delete(key);
          };
        }
      });
    },

    /** Registra un fallo: reintento con espera creciente, o error permanente (no se reintenta sin intervención). */
    failEntries(keys, message, { now = Date.now(), jitter = 1, permanent = false } = {}) {
      return tx([STORES.OUTBOX], 'readwrite', (t) => {
        const outbox = t.objectStore(STORES.OUTBOX);
        for (const key of keys) {
          outbox.get(key).onsuccess = (e) => {
            const entry = e.target.result;
            if (!entry) return;
            const tries = entry.tries + 1;
            outbox.put(permanent
              ? { ...entry, tries, status: 'error', lastError: message }
              : { ...entry, tries, nextAttemptAt: now + backoffMs(tries, jitter), lastError: message });
          };
        }
      });
    },

    /** Vuelve a poner en cola los registros que el servidor rechazó. */
    retryErrors() {
      return tx([STORES.OUTBOX], 'readwrite', (t) => {
        const outbox = t.objectStore(STORES.OUTBOX);
        outbox.getAll().onsuccess = (e) => {
          for (const entry of e.target.result) {
            if (entry.status === 'error') outbox.put({ ...entry, status: 'pending', tries: 0, nextAttemptAt: 0, lastError: null });
          }
        };
      });
    },

    async outboxStats(now = Date.now()) {
      const entries = await listAll(STORES.OUTBOX);
      const pending = entries.filter((e) => e.status === 'pending');
      const waiting = pending.filter((e) => e.nextAttemptAt > now).map((e) => e.nextAttemptAt);
      return {
        pending: pending.length,
        error: entries.filter((e) => e.status === 'error').length,
        due: pending.filter((e) => e.nextAttemptAt <= now).length,
        nextAttemptAt: waiting.length ? Math.min(...waiting) : null,
        lastError: entries.find((e) => e.lastError)?.lastError ?? null,
      };
    },

    /** Entradas de una migración que aún no se confirmaron en el servidor. */
    async countTagged(migrationId) {
      const tagged = (await listAll(STORES.OUTBOX)).filter((e) => e.migrationId === migrationId);
      return { pending: tagged.filter((e) => e.status === 'pending').length, error: tagged.filter((e) => e.status === 'error').length };
    },

    /**
     * Guarda lo que llega del servidor SIN encolarlo (no es un cambio local). Si un registro tiene una entrada
     * en la cola (cambio local sin confirmar), se conserva el local: el servidor aún no lo ha visto.
     */
    applyRemote({ solves = [], attempts = [] }) {
      const items = [...solves.map((r) => [STORES.SOLVES, r]), ...attempts.map((r) => [STORES.ATTEMPTS, r])];
      if (!items.length) return Promise.resolve();
      return tx([STORES.SOLVES, STORES.ATTEMPTS, STORES.OUTBOX], 'readwrite', (t) => {
        const outbox = t.objectStore(STORES.OUTBOX);
        for (const [store, record] of items) {
          outbox.get(`${store}:${record.id}`).onsuccess = (e) => {
            if (!e.target.result) t.objectStore(store).put({ ...record, updatedAt: SYNCED });
          };
        }
      });
    },

    /**
     * Copia registros ya existentes (de la migración desde invitado) conservando su id y su fecha de edición, y los
     * encola etiquetados con la migración. Es idempotente: si el id ya existe aquí no se toca, así que repetirlo tras
     * una interrupción no duplica ni pisa ediciones posteriores.
     */
    putMigrated(items, migrationId) {
      if (!items.length) return Promise.resolve();
      return tx([...DATA, STORES.OUTBOX], 'readwrite', (t) => {
        for (const { store, record } of items) {
          const s = t.objectStore(store);
          s.get(record.id).onsuccess = (e) => {
            if (e.target.result) return;
            s.put(record);
            enqueue(t, store, record.id, migrationId);
          };
        }
      });
    },

    close() {
      ended ??= 'cerrado';
      const pending = dbPromise;
      dbPromise = null;
      pending?.then((db) => db.close(), () => {});
    },

    /** Elimina la base entera (limpieza del espacio). */
    async destroy() {
      ended = 'eliminado';
      const pending = dbPromise;
      dbPromise = null;
      if (pending) (await pending.catch(() => null))?.close();
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve(); // otra pestaña la tiene abierta: se borrará al cerrarla
      });
    },
  };
}