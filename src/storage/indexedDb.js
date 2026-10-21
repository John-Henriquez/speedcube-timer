const DB_NAME = 'speedcube-timer';
const STORE = 'solves';
const VERSION = 1;

let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

async function run(mode, fn) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Todos los solves, en orden cronológico. */
export async function getSolves() {
  const all = await run('readonly', (store) => store.getAll());
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

/** Crea o reemplaza un solve. */
export async function saveSolve(solve) {
  await run('readwrite', (store) => store.put(solve));
}

export async function deleteSolve(id) {
  await run('readwrite', (store) => store.delete(id));
}

export async function clearSolves() {
  await run('readwrite', (store) => store.clear());
}
