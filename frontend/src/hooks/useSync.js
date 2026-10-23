import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNCED_EVENT } from '../sync/events.js';
import { getSyncConfig, normalizeUrl, saveSyncConfig } from '../sync/config.js';
import { checkHealth, login, syncNow } from '../sync/syncClient.js';

const INTERVAL_MS = 2 * 60 * 1000;

/**
 * Sincroniza al abrir la app, al volver la conexión, al volver a la pestaña y cada 2 minutos.
 * Si el servidor no responde (no estás en casa) no pasa nada: se reintenta más tarde.
 * `shouldSkip` permite no sincronizar en momentos sensibles (p. ej. con el timer corriendo).
 */
export function useSync({ shouldSkip = () => false } = {}) {
  const [state, setState] = useState({ status: 'idle', at: null, result: null, message: '', connected: false, serverUrl: '' });
  const busy = useRef(false);
  const skipRef = useRef(shouldSkip);
  skipRef.current = shouldSkip;

  const loadConfig = useCallback(async () => {
    const config = await getSyncConfig();
    setState((s) => ({ ...s, connected: Boolean(config.token), serverUrl: config.serverUrl }));
    return config;
  }, []);

  const run = useCallback(async ({ manual = false } = {}) => {
    if (busy.current || (!manual && skipRef.current())) return null;
    busy.current = true;
    setState((s) => ({ ...s, status: 'syncing' }));
    const result = await syncNow();
    busy.current = false;
    setState((s) => ({ ...s, status: result.status, result, message: result.message ?? '', at: result.at ?? s.at }));
    if (result.status === 'ok' && result.pulled.solves + result.pulled.attempts > 0) {
      window.dispatchEvent(new Event(SYNCED_EVENT));
    }
    return result;
  }, []);

  useEffect(() => {
    loadConfig().then(() => run());
    const tick = () => run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    const timer = setInterval(tick, INTERVAL_MS);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadConfig, run]);

  /** Comprueba el servidor, inicia sesión (la contraseña no se guarda) y sincroniza. */
  const connect = useCallback(async (rawUrl, username, password) => {
    try {
      const serverUrl = normalizeUrl(rawUrl);
      if (!(await checkHealth(serverUrl))) {
        throw new Error('No se pudo contactar con el servidor. ¿Está encendido y estás en la misma red?');
      }
      const token = await login(serverUrl, username, password);
      await saveSyncConfig({ serverUrl, token });
      await loadConfig();
      await run({ manual: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }, [loadConfig, run]);

  const disconnect = useCallback(async () => {
    const config = await getSyncConfig();
    await saveSyncConfig({ serverUrl: config.serverUrl, token: '' });
    await loadConfig();
    setState((s) => ({ ...s, status: 'idle', result: null, message: '' }));
  }, [loadConfig]);

  return { state, syncNow: () => run({ manual: true }), connect, disconnect };
}
