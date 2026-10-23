/**
 * Persistencia local en IndexedDB (v2).
 *
 * - Tres tiendas: solves, attempts y meta (valores sueltos, p. ej. la marca de la última sincronización).
 * - Borrado lógico: borrar un registro lo marca con `deletedAt` en vez de eliminarlo, para que la
 *   sincronización pueda avisar al servidor. Las lecturas normales ocultan los borrados.
 * - Cada escritura sella `updatedAt`, que es lo que permite subir solo lo que cambió.
 */
const DB_NAME = 'speedcube-timer';
const VERSION = 2;

export const STORES = Object.freeze({ SOLVES: 'solves', ATTEMPTS: 'attempts', META: 'meta' });

let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.SOLVES)) db.createObjectStore(STORES.SOLVES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.ATTEMPTS)) db.createObjectStore(STORES.ATTEMPTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });

      // v1 -> v2: las resoluciones ya guardadas reciben `updatedAt` para poder sincronizarse.
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

const getDb = () => (dbPromise ??= openDb());

async function run(storeName, mode, fn) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const now = () => new Date().toISOString();
const byDate = (a, b) => (a.date ?? '').localeCompare(b.date ?? '');

/** Registros visibles (sin borrados), en orden cronológico. */
async function listLive(storeName) {
  const all = await run(storeName, 'readonly', (s) => s.getAll());
  return all.filter((r) => !r.deletedAt).sort(byDate);
}

/** Crea o reemplaza un registro, sellando `updatedAt`. */
async function save(storeName, record) {
  await run(storeName, 'readwrite', (s) => s.put({ ...record, updatedAt: now() }));
}

async function softDelete(storeName, id) {
  const record = await run(storeName, 'readonly', (s) => s.get(id));
  if (!record || record.deletedAt) return;
  const stamp = now();
  await run(storeName, 'readwrite', (s) => s.put({ ...record, deletedAt: stamp, updatedAt: stamp }));
}

async function softDeleteAll(storeName) {
  const all = await run(storeName, 'readonly', (s) => s.getAll());
  const stamp = now();
  await run(storeName, 'readwrite', (s) => {
    all.filter((r) => !r.deletedAt).forEach((r) => s.put({ ...r, deletedAt: stamp, updatedAt: stamp }));
  });
}

export const getSolves = () => listLive(STORES.SOLVES);
export const saveSolve = (solve) => save(STORES.SOLVES, solve);
export const deleteSolve = (id) => softDelete(STORES.SOLVES, id);
export const clearSolves = () => softDeleteAll(STORES.SOLVES);

export const getAttempts = () => listLive(STORES.ATTEMPTS);
export const saveAttempt = (attempt) => save(STORES.ATTEMPTS, attempt);
export const deleteAttempt = (id) => softDelete(STORES.ATTEMPTS, id);

/**
 * Todo lo modificado después de `since` (marca de tiempo ISO del cliente), borrados incluidos.
 * Sin `since`, devuelve todo. Es lo que se sube al servidor en cada sincronización.
 */
export async function getChanges(since = null) {
  const pick = async (storeName) => {
    const all = await run(storeName, 'readonly', (s) => s.getAll());
    return all.filter((r) => !since || (r.updatedAt ?? '') > since).sort(byDate);
  };
  return { solves: await pick(STORES.SOLVES), attempts: await pick(STORES.ATTEMPTS) };
}

/** Marca de "ya sincronizado": un registro bajado del servidor no cuenta como cambio local. */
const SYNCED = '1970-01-01T00:00:00.000Z';

/**
 * Guarda registros que llegan del servidor sin volver a sellarlos con la hora actual
 * (si no, se subirían de nuevo). Si el usuario modificó un registro localmente después de
 * `protectAfter` (es decir, durante la sincronización), se conserva su versión.
 */
export async function applyRemote({ solves = [], attempts = [] }, { protectAfter = null } = {}) {
  const apply = (storeName, records) =>
    records.length === 0
      ? null
      : run(storeName, 'readwrite', (store) => {
          for (const record of records) {
            store.get(record.id).onsuccess = (e) => {
              const existing = e.target.result;
              if (existing && protectAfter && (existing.updatedAt ?? '') > protectAfter) return;
              store.put({ ...record, updatedAt: SYNCED });
            };
          }
        });
  await apply(STORES.SOLVES, solves);
  await apply(STORES.ATTEMPTS, attempts);
}

export async function getMeta(key) {
  const row = await run(STORES.META, 'readonly', (s) => s.get(key));
  return row ? row.value : null;
}

export const setMeta = (key, value) => run(STORES.META, 'readwrite', (s) => s.put({ key, value })).then(() => undefined);
