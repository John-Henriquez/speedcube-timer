import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import * as storage from '../storage/index.js';
import { kv } from '../storage/kv.js';
import { spaces } from '../storage/spaces.js';
import { createEngine } from '../sync/engine.js';
import { resumeMigrations, settleMigrations } from '../sync/migration.js';
import { createFakeServer, makeAttempt, makeSolve } from '../testing/fakeServer.js';
import { createAuthService, defaultServerUrl } from './service.js';

let server;
let services;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  spaces.reset();
  kv.reset();
  server = createFakeServer();
  services = [];
});
afterEach(() => services.forEach((s) => s.stop()));

const boot = async () => {
  const service = createAuthService({ fetchImpl: (...args) => server.fetch(...args), serverUrl: () => 'http://x', intervalMs: 60000, debounceMs: 5, logoutTimeoutMs: 2000 });
  services.push(service);
  await service.init();
  return service;
};
/** Equivale a cerrar y volver a abrir la página: se pierde lo que estaba en memoria, no lo guardado. */
const reload = async (service) => {
  service.stop();
  spaces.closeAll();
  return boot();
};
const syncAll = async (service) => {
  await service.idle();
  await service.syncNow();
  await service.idle();
};
const creds = (name) => ({ username: name, email: `${name}@example.com`, password: 'una-clave-larga-1' });
const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);
const ids = (rows) => rows.map((r) => r.id).sort();
const saveGuestData = async (solves, attempts = 0) => {
  for (let i = 1; i <= solves; i += 1) await storage.saveSolve(makeSolve(i));
  for (let i = 1; i <= attempts; i += 1) await storage.saveAttempt(makeAttempt(i));
};
const serverRow = (id, time_ms) => ({ id, session: null, puzzle: '3x3', time_ms, penalty: null, scramble: 'R', solved_at: '2026-10-01T00:00:00Z' });

describe('invitado', () => {
  it('usa la app completa sin cuenta, sin tocar la red, y conserva todo entre recargas', async () => {
    const guest = await boot();
    assert.equal(guest.getState().status, 'guest');
    await saveGuestData(4, 2);
    assert.equal(server.log.length, 0, 'un invitado nunca habla con el servidor');
    const again = await reload(guest);
    assert.equal(again.getState().status, 'guest');
    assert.equal((await storage.getSolves()).length, 4);
    assert.equal((await storage.getAttempts()).length, 2);
    assert.equal(server.log.length, 0);
  });
});

describe('invitado → registro de cuenta nueva', () => {
  it('migra sin duplicar, borra lo local solo tras confirmar y deja un invitado nuevo y vacío', async () => {
    const service = await boot();
    await saveGuestData(5, 3);
    server.syncOnline = false; // las cuentas funcionan, pero la subida aún no
    await service.register(creds('ana'));
    await service.idle();

    // Datos copiados a la cuenta, pero SIN confirmar: el invitado original sigue intacto.
    const { user, migrations } = service.getState();
    assert.equal(migrations[0].status, 'uploading');
    assert.equal(migrations[0].remaining, 8);
    assert.equal((await storage.getSolves()).length, 5, 'la app ya muestra los datos en la cuenta');
    const [sealed] = spaces.sealed(user.id);
    assert.equal((await spaces.sealedSpace(sealed.name).count()).total, 8, 'el espacio del invitado conserva todo hasta confirmar');
    assert.equal(server.ownRows('ana', 'solves').length, 0);

    server.syncOnline = true;
    await syncAll(service);
    assert.equal(server.ownRows('ana', 'solves').length, 5);
    assert.equal(server.ownRows('ana', 'attempts').length, 3);
    assert.equal(service.getState().migrations[0].status, 'done');
    assert.deepEqual(spaces.sealed(user.id), []);
    assert.ok(!(await dbNames()).includes(sealed.name), 'confirmado: ahora sí se borra el espacio del invitado');
    assert.equal((await spaces.guest().count()).total, 0);
    assert.equal((await service.getState().overview).pending, 0);
  });

  it('un registro rechazado por el servidor no se pierde: el espacio del invitado se conserva y se avisa', async () => {
    const service = await boot();
    await storage.saveSolve(makeSolve(1));
    await storage.saveSolve(makeSolve(2, { penalty: '+5' })); // el servidor lo rechazará
    await storage.saveSolve(makeSolve(3));
    await service.register(creds('ana'));
    await syncAll(service);
    const [migration] = service.getState().migrations;
    assert.deepEqual([migration.status, migration.rejected], ['error', 1]);
    assert.equal(server.ownRows('ana', 'solves').length, 2, 'lo válido sí se respaldó');
    const [sealed] = spaces.sealed(service.getState().user.id);
    assert.equal((await spaces.sealedSpace(sealed.name).count()).solves, 3, 'el original sigue completo');
    const out = await service.logout();
    assert.equal(out.backedUp, false, 'no se dice que hay respaldo si algo no se pudo guardar');
  });

  it('reanuda una migración interrumpida a medias sin duplicar nada', async () => {
    await saveGuestData(0);
    const guest = spaces.guest();
    for (let i = 1; i <= 5; i += 1) await guest.saveSolve(makeSolve(i));
    for (let i = 1; i <= 3; i += 1) await guest.saveAttempt(makeAttempt(i));
    const account = spaces.account(1);
    const id = `mig:${guest.name}`;
    // Estado en el que quedaría tras una caída: migración iniciada, guest sellado y solo 3 registros copiados.
    await account.setMeta('migrations', { [id]: { id, guest: guest.name, status: 'copying', total: { solves: 5, attempts: 3, total: 8 } } });
    spaces.sealGuest(1, id);
    await account.putMigrated((await guest.getSolves()).slice(0, 3).map((record) => ({ store: 'solves', record })), id);

    await resumeMigrations({ spaces, account, accountId: 1 });
    await resumeMigrations({ spaces, account, accountId: 1 }); // repetirlo no cambia nada
    assert.deepEqual(await account.count(), { solves: 5, attempts: 3, total: 8 });
    assert.equal((await account.outboxEntries()).length, 8, 'cada registro está una sola vez en la cola');

    const { token } = await (await server.fetch('http://x/api/auth/register/', { method: 'POST', body: JSON.stringify(creds('ana')) })).json();
    await createEngine({ space: account, serverUrl: 'http://x', token, fetchImpl: server.fetch }).syncOnce();
    await settleMigrations({ spaces, account });
    assert.equal(server.ownRows('ana', 'solves').length, 5);
    assert.equal(server.ownRows('ana', 'attempts').length, 3);
    assert.equal((await account.getMeta('migrations'))[id].status, 'done');
    assert.deepEqual(spaces.sealed(1), []);
  });

  it('traslada también el progreso local del almanaque sin pisar el de la cuenta', async () => {
    const service = await boot();
    await storage.saveSolve(makeSolve(1));
    await storage.setMeta('caseProgress', { 'oll-27': 'aprendido', 'oll-1': 'pendiente' });
    await storage.setMeta('userAlgorithms', { 'oll-27': [{ id: 'u1', notation: "R U R'" }] });
    await service.register(creds('ana'));
    await syncAll(service);
    assert.deepEqual(await storage.getMeta('caseProgress'), { 'oll-27': 'aprendido', 'oll-1': 'pendiente' });
    assert.equal((await storage.getMeta('userAlgorithms'))['oll-27'][0].id, 'u1');
  });
});

describe('invitado → inicio de sesión en cuenta existente', () => {
  it('fusiona el historial remoto con lo del invitado sin pisar ni duplicar', async () => {
    const first = await boot();
    await first.register(creds('beto'));
    await first.logout();
    for (let i = 1; i <= 4; i += 1) server.seed('beto', 'solves', serverRow(`remote-${i}`, 6000 + i));

    await saveGuestData(3); // el invitado cronometró estando sin cuenta
    const service = await boot();
    await service.login('beto', 'una-clave-larga-1');
    await syncAll(service);

    const mine = await storage.getSolves();
    assert.equal(mine.length, 7);
    assert.equal(new Set(mine.map((s) => s.id)).size, 7, 'sin duplicados');
    assert.equal(server.ownRows('beto', 'solves').length, 7);
    assert.deepEqual(server.ownRows('beto', 'solves').filter((r) => r.id.startsWith('remote')).map((r) => r.time_ms).sort(), [6001, 6002, 6003, 6004], 'lo remoto no se tocó');
    assert.equal((await spaces.guest().count()).total, 0);
  });

  it('recupera el historial al volver a iniciar sesión (el espacio local se había limpiado)', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await saveGuestData(3);
    await syncAll(service);
    assert.equal((await service.logout()).backedUp, true);
    assert.equal((await storage.getSolves()).length, 0);
    await service.login('ana', 'una-clave-larga-1');
    await syncAll(service);
    assert.equal((await storage.getSolves()).length, 3);
  });
});

describe('cierre de sesión', () => {
  it('con todo sincronizado: limpia el espacio, revoca la sesión y deja un invitado vacío', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await saveGuestData(2);
    await syncAll(service);
    const { user } = service.getState();
    const result = await service.logout();
    assert.deepEqual(result, { backedUp: true, pending: 0, errors: 0, migrationsPending: 0 });
    assert.equal(service.getState().status, 'guest');
    assert.equal((await storage.getSolves()).length, 0);
    assert.ok(!(await dbNames()).includes(`speedcube-timer:acct:${user.id}`), 'el espacio de la cuenta se limpió');
    assert.equal(kv.get('speedcube:auth'), null);
    assert.ok(server.log.some((l) => l.path === '/api/auth/logout/'), 'la sesión se invalidó en el servidor');
    assert.deepEqual(service.getState().pendingAccounts, []);
  });

  it('sin conexión: conserva los datos aislados, avisa, y ni el próximo invitado ni otra cuenta los ven', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await syncAll(service);
    server.online = false;
    await saveGuestData(2);
    const result = await service.logout();
    assert.equal(result.backedUp, false);
    assert.equal(result.pending, 2);
    assert.deepEqual(service.getState().pendingAccounts.map((a) => [a.username, a.pending]), [['ana', 2]]);

    assert.equal((await storage.getSolves()).length, 0, 'el invitado siguiente ve un espacio vacío');
    await storage.saveSolve(makeSolve(50, { id: 'del-invitado' }));
    server.online = true;
    await service.register(creds('carla'));
    await syncAll(service);
    assert.deepEqual(ids(await storage.getSolves()), ['del-invitado'], 'carla solo tiene lo del invitado, nada de ana');
    assert.equal(server.ownRows('ana', 'solves').length, 0, 'lo de ana sigue sin subir');
    assert.equal((await service.logout()).backedUp, true);

    await service.login('ana', 'una-clave-larga-1'); // vuelve ana: se reanuda su subida
    await syncAll(service);
    assert.equal(server.ownRows('ana', 'solves').length, 2);
    assert.deepEqual(ids(await storage.getSolves()), ['solve-1', 'solve-2']);
    assert.deepEqual(service.getState().pendingAccounts, []);
    assert.deepEqual(ids(server.ownRows('carla', 'solves')), ['del-invitado'], 'nada se cruzó entre cuentas');
  });

  it('no afirma que hay respaldo si el servidor falla durante el cierre', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await syncAll(service);
    await saveGuestData(1);
    server.forceStatus = 503;
    const result = await service.logout();
    assert.equal(result.backedUp, false);
    assert.equal(result.pending, 1);
    server.forceStatus = null;
    await service.login('ana', 'una-clave-larga-1');
    await syncAll(service);
    assert.equal(server.ownRows('ana', 'solves').length, 1, 'tras reconectar, el dato pendiente se subió');
  });

  it('con wait:false no bloquea ni espera: conserva lo pendiente al instante', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await syncAll(service);
    server.syncOnline = false;
    await saveGuestData(1);
    const t0 = Date.now();
    const result = await service.logout({ wait: false });
    assert.ok(Date.now() - t0 < 500);
    assert.equal(result.backedUp, false);
  });
});

describe('sesión persistente y recargas', () => {
  it('la sesión y la cola sobreviven a recargar la página y se reanuda la subida', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await syncAll(service);
    server.syncOnline = false;
    await storage.saveSolve(makeSolve(1));
    const again = await reload(service);
    assert.equal(again.getState().status, 'account');
    assert.equal(again.getState().user.username, 'ana');
    assert.equal(again.getState().overview.pending, 1, 'la cola persistió');
    assert.equal((await storage.getSolves()).length, 1);
    server.syncOnline = true;
    await syncAll(again);
    assert.equal(server.ownRows('ana', 'solves').length, 1);
    assert.equal((await again.getState().overview).pending, 0);
  });

  it('una migración a medias se retoma tras recargar', async () => {
    const service = await boot();
    await saveGuestData(4);
    server.syncOnline = false;
    await service.register(creds('ana'));
    await service.idle();
    const again = await reload(service);
    server.syncOnline = true;
    await syncAll(again);
    assert.equal(server.ownRows('ana', 'solves').length, 4);
    assert.equal(again.getState().migrations[0].status, 'done');
  });

  it('si la sesión caduca en el servidor, los datos se conservan y se retoma al iniciar sesión de nuevo', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await syncAll(service);
    server.revokeAll();
    await storage.saveSolve(makeSolve(1));
    await service.syncNow();
    assert.equal(service.getState().sessionExpired, true);
    assert.equal((await storage.getSolves()).length, 1);
    await service.login('ana', 'una-clave-larga-1');
    await syncAll(service);
    assert.equal(service.getState().sessionExpired, false);
    assert.equal(server.ownRows('ana', 'solves').length, 1);
  });
});

describe('aislamiento entre cuentas', () => {
  it('el invitado sellado para una cuenta no se puede migrar a otra', async () => {
    const service = await boot();
    await saveGuestData(5);
    server.syncOnline = false;
    await service.register(creds('ana')); // la migración de ana queda a medias
    await service.idle();
    await service.logout({ wait: false });

    const other = await boot();
    const reg = await other.register(creds('beto'));
    assert.equal(reg.user.username, 'beto');
    server.syncOnline = true;
    await syncAll(other);
    assert.equal((await storage.getSolves()).length, 0, 'beto no recibe lo del invitado de ana');
    assert.equal(server.ownRows('beto', 'solves').length, 0);
    await other.logout();

    const ana = await boot();
    await ana.login('ana', 'una-clave-larga-1');
    await syncAll(ana);
    assert.equal(server.ownRows('ana', 'solves').length, 5);
    assert.equal(server.ownRows('beto', 'solves').length, 0);
  });

  it('cambiar entre cuentas no mezcla información y cada una recupera la suya', async () => {
    const service = await boot();
    await service.register(creds('ana'));
    await saveGuestData(3);
    await syncAll(service);
    await service.logout();
    await service.register(creds('beto'));
    assert.equal((await storage.getSolves()).length, 0);
    await storage.saveSolve(makeSolve(90, { id: 'de-beto' }));
    await syncAll(service);
    await service.logout();
    await service.login('ana', 'una-clave-larga-1');
    await syncAll(service);
    assert.deepEqual(ids(await storage.getSolves()), ['solve-1', 'solve-2', 'solve-3']);
    assert.deepEqual(ids(server.ownRows('beto', 'solves')), ['de-beto']);
  });
});

describe('errores y ajustes', () => {
  it('un inicio de sesión o registro fallido no cambia de espacio ni toca los datos del invitado', async () => {
    const service = await boot();
    await saveGuestData(2);
    await server.fetch('http://x/api/auth/register/', { method: 'POST', body: JSON.stringify(creds('ana')) }); // ya existe
    await assert.rejects(() => service.login('nadie', 'mal'), (e) => e.code === 'invalid_credentials');
    await assert.rejects(() => service.register(creds('ana')), (e) => e.fields.username?.length === 1);
    assert.equal(service.getState().status, 'guest');
    assert.equal(service.getState().busy, null, 'la interfaz no queda "ocupada" tras el error');
    assert.equal((await storage.getSolves()).length, 2);
    assert.equal(spaces.sealed(1).length, 0, 'no se selló nada: no hubo migración');
  });

  it('sin servidor el registro falla con un error de red claro y no se pierde nada', async () => {
    const service = await boot();
    await saveGuestData(2);
    server.online = false;
    await assert.rejects(() => service.register(creds('ana')), (e) => e.code === 'network');
    assert.equal(service.getState().status, 'guest');
    assert.equal((await storage.getSolves()).length, 2);
  });

  it('la dirección del servidor se valida y se recuerda; por defecto sale del equipo que sirve la página', async () => {
    const service = await boot();
    assert.throws(() => service.setServerUrl('localhost:8000'), /http/);
    service.setServerUrl('http://192.168.1.50:8000/');
    assert.equal(defaultServerUrl(kv), 'http://192.168.1.50:8000');
    kv.remove('speedcube:server');
    assert.equal(defaultServerUrl(kv), 'http://localhost:8000');
  });
});