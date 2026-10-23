import * as storage from '../storage/index.js';
import { getSyncConfig } from './config.js';
import { attemptFromServer, attemptToServer, solveFromServer, solveToServer } from './mapping.js';

const META_PUSH = 'lastPushAt'; // hora (del cliente) hasta la que ya se subió todo
const META_SERVER = 'lastServerTime'; // `server_time` de la última descarga
const META_SYNC = 'lastSyncAt';

async function request(fetchImpl, url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** ¿El servidor responde? Es la forma de saber si estás en casa. */
export async function checkHealth(serverUrl, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  try {
    return (await request(fetchImpl, `${serverUrl}/api/health/`, {}, timeoutMs)).ok;
  } catch {
    return false;
  }
}

/** Pide un token con usuario y contraseña. La contraseña no se guarda. */
export async function login(serverUrl, username, password, { fetchImpl = fetch } = {}) {
  const res = await request(fetchImpl, `${serverUrl}/api/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(res.status === 400 ? 'Usuario o contraseña incorrectos.' : `El servidor respondió ${res.status}.`);
  return (await res.json()).token;
}

const isAuthError = (res) => res.status === 401 || res.status === 403;

async function failure(res, what) {
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  return { status: 'error', message: `${what} (${res.status}). ${detail}`.trim() };
}

/**
 * Sincroniza en dos pasos: sube lo modificado y luego baja lo nuevo. Nunca lanza: devuelve
 * { status: 'ok' | 'offline' | 'unauthorized' | 'not_configured' | 'error', ... }.
 * Las marcas de avance solo se mueven si todo salió bien, así que reintentar es seguro.
 */
export async function syncNow({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const config = await getSyncConfig();
  if (!config.serverUrl || !config.token) return { status: 'not_configured' };
  if (!(await checkHealth(config.serverUrl, { fetchImpl }))) return { status: 'offline' };

  const startedAt = now().toISOString();
  const headers = { 'Content-Type': 'application/json', Authorization: `Token ${config.token}` };
  const url = `${config.serverUrl}/api/sync/`;

  try {
    // 1) Subir
    const changes = await storage.getChanges(await storage.getMeta(META_PUSH));
    const push = await request(fetchImpl, url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        solves: changes.solves.map(solveToServer),
        attempts: changes.attempts.map(attemptToServer),
      }),
    });
    if (isAuthError(push)) return { status: 'unauthorized' };
    if (!push.ok) return failure(push, 'El servidor rechazó los cambios');

    // 2) Bajar
    const since = await storage.getMeta(META_SERVER);
    const pull = await request(fetchImpl, since ? `${url}?since=${encodeURIComponent(since)}` : url, { headers });
    if (isAuthError(pull)) return { status: 'unauthorized' };
    if (!pull.ok) return failure(pull, 'No se pudieron descargar los cambios');
    const data = await pull.json();
    const solves = (data.solves ?? []).map(solveFromServer);
    const attempts = (data.attempts ?? []).map(attemptFromServer);
    await storage.applyRemote({ solves, attempts }, { protectAfter: startedAt });

    // 3) Avanzar las marcas (1 ms de margen para no perder una edición del mismo instante)
    await storage.setMeta(META_PUSH, new Date(Date.parse(startedAt) - 1).toISOString());
    await storage.setMeta(META_SERVER, data.server_time);
    await storage.setMeta(META_SYNC, startedAt);

    return {
      status: 'ok',
      at: startedAt,
      pushed: { solves: changes.solves.length, attempts: changes.attempts.length },
      pulled: { solves: solves.length, attempts: attempts.length },
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

export const getLastSync = () => storage.getMeta(META_SYNC);
