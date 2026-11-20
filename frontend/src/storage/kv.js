/**
 * Almacenamiento pequeño de clave-valor para lo que NO es un dato de entrenamiento: el registro de espacios y
 * la sesión. Usa localStorage; donde no existe (pruebas) usa memoria.
 */
const memory = new Map();

function local() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // acceso bloqueado por el navegador
  }
}

export const kv = {
  get(key) {
    try {
      const storage = local();
      const raw = storage ? storage.getItem(key) : memory.get(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    try {
      const storage = local();
      if (storage) storage.setItem(key, raw);
      else memory.set(key, raw);
    } catch {
      memory.set(key, raw);
    }
  },
  remove(key) {
    try {
      local()?.removeItem(key);
    } catch {
      /* nada */
    }
    memory.delete(key);
  },
  /** Solo para pruebas. */
  reset() {
    memory.clear();
  },
};