import * as defaultStorage from '../storage/index.js';
import { kv as defaultKv } from '../storage/kv.js';
import { spaces as defaultSpaces } from '../storage/spaces.js';
import { createController } from '../sync/controller.js';
import { createEngine } from '../sync/engine.js';
import { EVENTS, emit, on } from '../sync/events.js';
import { listMigrations, resumeMigrations, settleMigrations, startMigration } from '../sync/migration.js';
import { createApi } from './api.js';

/**
 * Servicio de cuentas: sesión, cambio entre invitado y cuenta, sincronización automática y migración.
 * No depende de React (la interfaz lo usa a través de AuthContext), así que se puede probar entero.
 *
 * Sesión: el token se guarda en localStorage (necesario para seguir funcionando sin conexión). Caduca en el
 * servidor y se invalida al cerrar sesión; si cambia de dispositivo, se inicia sesión de nuevo.
 */
const SESSION_KEY = 'speedcube:auth';
const SERVER_KEY = 'speedcube:server';

/** Servidor por defecto: el mismo equipo que sirve la página, en el puerto 8000 (así también funciona desde el celular). */
export function defaultServerUrl(kv = defaultKv) {
  const saved = kv.get(SERVER_KEY);
  if (saved) return saved;
  const fromBuild = import.meta.env?.VITE_API_URL;
  if (fromBuild) return fromBuild.replace(/\/+$/, '');
  const loc = globalThis.location;
  return loc ? `${loc.protocol}//${loc.hostname}:8000` : 'http://localhost:8000';
}

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, displayName: u.display_name, providers: u.providers ?? [] });
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))]);

export function createAuthService({
  kv = defaultKv, spaces = defaultSpaces, storage = defaultStorage, fetchImpl, serverUrl = () => defaultServerUrl(kv),
  shouldSkip = () => false, intervalMs, debounceMs, logoutTimeoutMs = 10000,
} = {}) {
  let session = null;
  let engine = null;
  let controller = null;
  let migrationTask = null;
  let initPromise = null;
  let ui = { busy: null, sessionExpired: false, syncState: 'idle', lastResult: null, overview: null, migrations: [] };

  const api = () => createApi({ serverUrl: session?.serverUrl ?? serverUrl(), fetchImpl });

  function getState() {
    return {
      status: session ? 'account' : 'guest',
      user: session?.user ?? null,
      serverUrl: session?.serverUrl ?? serverUrl(),
      ...ui,
      pendingAccounts: spaces.pendingAccounts(),
    };
  }

  async function refresh() {
    ui = {
      ...ui,
      overview: engine ? await engine.overview() : null,
      migrations: engine ? await listMigrations(engine.space) : [],
    };
    emit(EVENTS.STATE, getState());
  }

  async function afterSync(result) {
    ui = { ...ui, syncState: result.status === 'ok' ? 'idle' : result.status, lastResult: result };
    if (result.status === 'ok' && engine) await settleMigrations({ spaces, account: engine.space });
    if (result.status === 'unauthorized') {
      ui = { ...ui, sessionExpired: true }; // la sesión caducó: los datos siguen aquí; se retoma al iniciar sesión
      controller?.stop();
    }
    await refresh();
  }

  async function enterAccount(next) {
    session = next;
    kv.set(SESSION_KEY, session);
    const account = spaces.account(session.user.id);
    storage.activate(account);
    spaces.clearPending(session.user.id);
    engine = createEngine({ space: account, serverUrl: session.serverUrl, token: session.token, fetchImpl });
    controller = createController({ engine, shouldSkip, intervalMs, debounceMs, onResult: afterSync });
    ui = { ...ui, sessionExpired: false, syncState: 'idle' };
    const accountId = session.user.id;
    // En segundo plano: la app ya muestra la cuenta mientras los datos del invitado se copian.
    migrationTask = (async () => {
      await resumeMigrations({ spaces, account, accountId });
      await startMigration({ spaces, guest: spaces.guest(), account, accountId });
    })().catch((error) => console.error('[migración]', error)).finally(() => refresh());
    controller.start();
    await refresh();
  }

  async function signIn(response) {
    if (session) await service.logout({ wait: false }); // otra sesión (p. ej. caducada): sus datos pendientes se conservan aislados
    await enterAccount({ serverUrl: serverUrl(), token: response.token, user: publicUser(response.user) });
    return getState();
  }

  const guarded = async (kind, fn) => {
    ui = { ...ui, busy: kind };
    emit(EVENTS.STATE, getState());
    try {
      return await fn();
    } finally {
      ui = { ...ui, busy: null };
      emit(EVENTS.STATE, getState());
    }
  };

  const service = {
    getState,
    subscribe: (fn) => on(EVENTS.STATE, fn),
    /** Para las pruebas: espera a que termine la migración en segundo plano. */
    idle: () => migrationTask ?? Promise.resolve(),

    /** Arranca el servicio (una sola vez aunque se llame varias, p. ej. el doble montaje de React en desarrollo). */
    init() {
      initPromise ??= (async () => {
        session = kv.get(SESSION_KEY);
        if (session) await enterAccount(session);
        else {
          storage.activate(spaces.guest());
          await refresh();
        }
        return getState();
      })();
      return initPromise;
    },

    register: (data) => guarded('login', async () => signIn(await api().register(data))),
    login: (identifier, password) => guarded('login', async () => signIn(await api().login(identifier, password))),
    loginWithGoogle: (credential) => guarded('login', async () => signIn(await api().google(credential))),
    requestReset: (email) => api().requestReset(email),
    confirmReset: (payload) => api().confirmReset(payload),

    /**
     * Cierra sesión sin afirmar nada que no se haya confirmado:
     *  - Intenta sincronizar lo pendiente y esperar la migración (hasta `logoutTimeoutMs`; `wait: false` no espera).
     *  - Si TODO está confirmado en el servidor: limpia el espacio de la cuenta y deja un invitado nuevo y vacío.
     *  - Si no (sin conexión, errores, migración a medias): NO borra nada; conserva los datos en el espacio aislado
     *    de esa cuenta y lo anota para avisar. Se retoman al volver a iniciar sesión con la misma cuenta.
     */
    logout: ({ wait = true } = {}) => guarded('logout', async () => {
      if (!session) return { backedUp: true, pending: 0, errors: 0, migrationsPending: 0 };
      const { user, token } = session;
      const account = engine.space;
      if (wait) {
        await withTimeout(controller.syncNow({ force: true }), logoutTimeoutMs);
        await withTimeout(migrationTask ?? Promise.resolve(), logoutTimeoutMs);
        await settleMigrations({ spaces, account }).catch(() => {});
      }
      const stats = await account.outboxStats();
      const unfinished = (await listMigrations(account)).filter((m) => m.status !== 'done');
      const backedUp = stats.pending === 0 && stats.error === 0 && unfinished.length === 0;
      controller?.stop();
      if (backedUp) {
        try { await api().logout(token); } catch { /* el token caduca solo en el servidor */ }
        await spaces.destroyAccount(user.id);
      } else {
        spaces.markPending(user.id, {
          username: user.username, pending: stats.pending, error: stats.error, migrations: unfinished.length, since: new Date().toISOString(),
        });
      }
      session = null;
      engine = null;
      controller = null;
      kv.remove(SESSION_KEY);
      ui = { busy: 'logout', sessionExpired: false, syncState: 'idle', lastResult: null, overview: null, migrations: [] };
      storage.activate(spaces.guest());
      await refresh();
      return { backedUp, pending: stats.pending, errors: stats.error, migrationsPending: unfinished.length };
    }),

    syncNow: async () => controller?.syncNow({ force: true }),
    async retryErrors() {
      await engine.space.retryErrors();
      await controller.syncNow({ force: true });
    },

    async updateProfile(displayName) {
      const user = publicUser(await api().updateProfile(session.token, displayName));
      session = { ...session, user };
      kv.set(SESSION_KEY, session);
      await refresh();
      return user;
    },
    changePassword: (oldPassword, newPassword) => api().changePassword(session.token, oldPassword, newPassword),
    async linkGoogle(credential) {
      session = { ...session, user: publicUser(await api().linkGoogle(session.token, credential)) };
      kv.set(SESSION_KEY, session);
      await refresh();
    },
    async unlinkGoogle() {
      session = { ...session, user: publicUser(await api().unlinkGoogle(session.token)) };
      kv.set(SESSION_KEY, session);
      await refresh();
    },
    setServerUrl(url) {
      if (session) throw new Error('Cambia el servidor antes de iniciar sesión.');
      const clean = url.trim().replace(/\/+$/, '');
      if (!/^https?:\/\/.+/i.test(clean)) throw new Error('La dirección debe empezar con http:// o https://');
      kv.set(SERVER_KEY, clean);
      emit(EVENTS.STATE, getState());
    },
    stop: () => controller?.stop(),
  };
  return service;
}