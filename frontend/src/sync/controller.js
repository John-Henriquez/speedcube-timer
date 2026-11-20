import { EVENTS, on } from './events.js';

/**
 * Hace automática la sincronización: lanza ciclos al empezar, poco después de cada cambio local, al recuperar la
 * conexión, al volver a la pestaña, cuando termina una espera de reintento y cada `intervalMs`. Nunca hay dos ciclos
 * a la vez; si llega otra petición mientras uno corre, se encadena uno más. No sincroniza mientras `shouldSkip()`
 * (p. ej., con el cronómetro corriendo) salvo que se fuerce.
 */
export function createController({ engine, shouldSkip = () => false, intervalMs = 30000, debounceMs = 1500, onResult = () => {} }) {
  let stopped = true;
  let inFlight = null;
  let again = false;
  let timer = null;
  let debounce = null;
  const cleanups = [];

  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };

  async function schedule() {
    clear();
    if (stopped) return;
    let delay = intervalMs;
    try {
      const { nextAttemptAt } = await engine.overview();
      if (nextAttemptAt) delay = Math.max(250, Math.min(intervalMs, nextAttemptAt - Date.now() + 50)); // justo cuando termina la espera
    } catch {
      /* se usa el intervalo normal */
    }
    if (!stopped) timer = setTimeout(() => run(), delay);
  }

  function run({ force = false } = {}) {
    if (stopped && !force) return Promise.resolve(null);
    if (inFlight) {
      // Una petición normal se junta con el ciclo en curso (y encadena uno más). Una forzada (botón, cierre de
      // sesión) necesita un ciclo que EMPIECE después de pedirla: espera al actual y lanza el suyo.
      if (force) return inFlight.then(() => run({ force: true }));
      again = true;
      return inFlight;
    }
    if (!force && shouldSkip()) {
      schedule();
      return Promise.resolve(null);
    }
    inFlight = (async () => {
      try {
        const result = await engine.syncOnce({ force });
        try {
          await onResult(result);
        } catch (error) {
          console.error('[sync] error al procesar el resultado:', error.message); // p. ej. el espacio se eliminó durante el cierre de sesión
        }
        return result;
      } finally {
        inFlight = null;
        if (again && !stopped) {
          again = false;
          setTimeout(() => run(), 0);
        } else {
          schedule();
        }
      }
    })();
    return inFlight;
  }

  const onChange = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => run(), debounceMs);
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      cleanups.push(on(EVENTS.LOCAL_CHANGE, onChange));
      const target = globalThis;
      if (typeof target.addEventListener === 'function') {
        const wake = () => run();
        const visible = () => target.document?.visibilityState === 'visible' && run();
        target.addEventListener('online', wake);
        target.document?.addEventListener?.('visibilitychange', visible);
        cleanups.push(() => {
          target.removeEventListener('online', wake);
          target.document?.removeEventListener?.('visibilitychange', visible);
        });
      }
      run();
    },
    stop() {
      stopped = true;
      clear();
      clearTimeout(debounce);
      cleanups.splice(0).forEach((fn) => fn());
    },
    /** Sincroniza ya (ignora las esperas de reintento si `force`). */
    syncNow: ({ force = true } = {}) => run({ force }),
    isRunning: () => !stopped,
  };
}