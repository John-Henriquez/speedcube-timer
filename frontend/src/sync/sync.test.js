import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { kv } from '../storage/kv.js';
import { createSpace } from '../storage/space.js';
import { spaces } from '../storage/spaces.js';
import { createFakeServer, makeAttempt, makeSolve } from '../testing/fakeServer.js';
import { createController } from './controller.js';
import { createEngine } from './engine.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  spaces.reset();
  kv.reset();
});

async function setup(options = {}) {
  const server = createFakeServer();
  await server.fetch('http://x/api/auth/register/', { method: 'POST', body: JSON.stringify({ username: 'ana', email: 'ana@example.com', password: 'p' }) });
  const login = await (await server.fetch('http://x/api/auth/login/', { method: 'POST', body: JSON.stringify({ identifier: 'ana', password: 'p' }) })).json();
  const space = createSpace('acct', { sync: true });
  let clock = 1_000_000;
  const engine = createEngine({ space, serverUrl: 'http://x', token: login.token, fetchImpl: (...args) => server.fetch(...args), now: () => clock, rng: () => 0.5, ...options });
  return { server, space, engine, advance: (ms) => { clock += ms; }, token: login.token };
}

describe('subida de la cola', () => {
  it('sube lo pendiente, vacía la cola y marca la sincronización', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    await space.saveAttempt(makeAttempt(1));
    const result = await engine.syncOnce();
    assert.equal(result.status, 'ok');
    assert.equal(result.pushed, 2);
    assert.equal((await space.outboxEntries()).length, 0);
    assert.equal(server.ownRows('ana', 'solves').length, 1);
    assert.equal(server.ownRows('ana', 'attempts').length, 1);
    assert.ok((await engine.overview()).lastSyncAt);
  });

  it('reenviar no duplica: el id es estable (idempotencia)', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    await engine.syncOnce();
    await space.saveSolve(makeSolve(1)); // misma resolución, editada de nuevo
    await engine.syncOnce();
    await engine.syncOnce();
    assert.equal(server.ownRows('ana', 'solves').length, 1);
  });

  it('envía por lotes sin perder ni repetir registros', async () => {
    const { server, space, engine } = await setup({ batchSize: 40 });
    for (let i = 0; i < 130; i += 1) await space.saveSolve(makeSolve(i));
    const result = await engine.syncOnce();
    assert.equal(result.pushed, 130);
    assert.deepEqual(server.syncPosts.map((p) => p.solves), [40, 40, 40, 10]);
    assert.equal(server.ownRows('ana', 'solves').length, 130);
  });

  it('el borrado también se sincroniza', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    await engine.syncOnce();
    await space.deleteSolve('solve-1');
    await engine.syncOnce();
    assert.ok(server.ownRows('ana', 'solves')[0].deleted_at);
  });

  it('sincroniza aunque el navegador diga que no hay conexión (no depende de navigator.onLine)', async () => {
    const { server, space, engine } = await setup();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    try {
      await space.saveSolve(makeSolve(1));
      assert.equal((await engine.syncOnce()).status, 'ok');
      assert.equal(server.ownRows('ana', 'solves').length, 1);
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else delete globalThis.navigator;
    }
  });
});

describe('fallos y reintentos', () => {
  it('sin conexión: nada se pierde, el estado es offline y queda anotado el reintento', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    server.online = false;
    assert.equal((await engine.syncOnce()).status, 'offline');
    const [entry] = await space.outboxEntries();
    assert.deepEqual([entry.status, entry.tries, entry.lastError], ['pending', 1, 'Sin conexión con el servidor']);
    await engine.syncOnce(); // aún en espera: no gasta otro intento
    assert.equal((await space.outboxEntries())[0].tries, 1);
    assert.equal((await engine.overview()).pending, 1);
  });

  it('respeta la espera y, al volver la conexión, sube todo lo acumulado', async () => {
    const { server, space, engine, advance } = await setup();
    await space.saveSolve(makeSolve(1));
    server.online = false;
    await engine.syncOnce(); // intento 1: falla
    server.online = true;
    const early = await engine.syncOnce(); // aún en espera: no envía nada
    assert.equal(early.pushed, 0);
    assert.equal(server.syncPosts.length, 0);
    advance(3000); // pasa la espera de ~2 s
    const result = await engine.syncOnce();
    assert.equal(result.pushed, 1);
    assert.equal((await space.outboxEntries()).length, 0);
  });

  it('la espera crece en cada fallo seguido', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    server.online = false;
    const waits = [];
    for (let i = 0; i < 4; i += 1) {
      await engine.syncOnce({ force: true });
      const [entry] = await space.outboxEntries();
      waits.push(entry.nextAttemptAt - 1_000_000);
    }
    assert.deepEqual(waits, [2000, 4000, 8000, 16000]);
  });

  it('un error del servidor (500) es transitorio: se reintenta, no se descarta', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    server.forceStatus = 503;
    assert.equal((await engine.syncOnce()).status, 'error');
    const [entry] = await space.outboxEntries();
    assert.equal(entry.status, 'pending');
    assert.equal(entry.tries, 1);
  });

  it('sesión caducada (401): no castiga los datos ni gasta reintentos', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    server.revokeAll();
    assert.equal((await engine.syncOnce()).status, 'unauthorized');
    const [entry] = await space.outboxEntries();
    assert.deepEqual([entry.status, entry.tries], ['pending', 0]);
  });

  it('un registro rechazado queda en error con el motivo, y los demás sí se suben', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    await space.saveSolve(makeSolve(2, { penalty: '+5' })); // el servidor lo rechaza
    await space.saveSolve(makeSolve(3));
    const result = await engine.syncOnce();
    assert.deepEqual([result.pushed, result.rejected], [2, 1]);
    const entries = await space.outboxEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, 'error');
    assert.match(entries[0].lastError, /penalty/);
    assert.equal(server.ownRows('ana', 'solves').length, 2);
    assert.equal((await engine.syncOnce()).rejected, 0, 'el rechazado no se reenvía en bucle');
  });
});

describe('bajada y conflictos', () => {
  it('trae el historial del servidor y luego solo lo nuevo', async () => {
    const { server, space, engine } = await setup();
    server.seed('ana', 'solves', { id: 'solve-9', session: null, puzzle: '3x3', time_ms: 8000, penalty: null, scramble: 'R', solved_at: '2026-10-01T00:09:00Z' });
    const first = await engine.syncOnce();
    assert.equal(first.pulled, 1);
    assert.deepEqual((await space.getSolves()).map((s) => s.id), ['solve-9']);
    assert.equal((await space.outboxEntries()).length, 0, 'bajar no genera cola');
    assert.equal((await engine.syncOnce()).pulled, 0, 'la segunda vez no hay nada nuevo');
  });

  it('no pisa un cambio local pendiente con la versión del servidor', async () => {
    const { server, space, engine } = await setup();
    const row = { id: 'solve-1', session: null, puzzle: '3x3', time_ms: 1000, penalty: null, scramble: 'R', solved_at: '2026-10-01T00:01:00Z' };
    server.seed('ana', 'solves', row);
    await engine.syncOnce();
    await space.saveSolve({ ...(await space.getSolves())[0], penalty: '+2' }); // edición local aún sin enviar
    await space.failEntries(['solves:solve-1'], 'en espera', { now: 1_000_000 }); // y en espera de reintento
    server.seed('ana', 'solves', { ...row, time_ms: 2000 }); // mientras tanto el servidor cambió
    const result = await engine.syncOnce(); // no toca subir todavía, pero sí bajar
    assert.equal(result.pulled, 1);
    const [mine] = await space.getSolves();
    assert.equal(mine.penalty, '+2', 'se conserva el cambio local');
    assert.equal(mine.time, 1000, 'y no se mezcla con la versión del servidor');
  });

  it('si el servidor ya tiene una versión más reciente, gana la del servidor', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1, { time: 7777 })); // edición de este dispositivo
    const local = (await space.getSolves())[0];
    server.seed('ana', 'solves', { // otro dispositivo editó después
      id: 'solve-1', session: null, puzzle: '3x3', time_ms: 5000, penalty: null, scramble: 'R U',
      solved_at: local.date, client_updated_at: new Date(Date.parse(local.updatedAt) + 60_000).toISOString(),
    });
    const result = await engine.syncOnce();
    assert.equal(result.stale, 1);
    assert.equal((await space.outboxEntries()).length, 0, 'el conflicto queda resuelto');
    assert.equal((await space.getSolves())[0].time, 5000, 'se ve la versión ganadora');
    assert.equal(server.ownRows('ana', 'solves')[0].time_ms, 5000, 'el servidor no se pisó');
  });

  it('una edición hecha durante el envío no se pierde', async () => {
    const { server, space, token } = await setup();
    await space.saveSolve(makeSolve(1));
    let edited = false;
    const engine = createEngine({
      space, serverUrl: 'http://x', token, now: () => 1_000_000,
      fetchImpl: async (url, opts) => {
        if (!edited && opts.method === 'POST') {
          edited = true;
          await space.saveSolve(makeSolve(1, { time: 4321 })); // el usuario edita mientras viaja el envío
        }
        return server.fetch(url, opts);
      },
    });
    await engine.syncOnce();
    assert.equal(server.ownRows('ana', 'solves')[0].time_ms, 4321, 'al final el servidor tiene la edición más reciente');
    assert.equal((await space.outboxEntries()).length, 0);
  });
});

describe('controlador automático', () => {
  it('sincroniza solo poco después de un cambio local, sin que nadie pulse nada', async () => {
    const { server, space, engine } = await setup();
    const controller = createController({ engine, debounceMs: 10, intervalMs: 60000 });
    controller.start();
    await controller.syncNow(); // ciclo inicial
    await space.saveSolve(makeSolve(1));
    await new Promise((r) => setTimeout(r, 150));
    controller.stop();
    assert.equal(server.ownRows('ana', 'solves').length, 1);
    assert.equal((await space.outboxEntries()).length, 0);
  });

  it('no sincroniza mientras corre el cronómetro (shouldSkip), pero sí al forzar', async () => {
    const { server, space, engine } = await setup();
    let busy = true;
    const controller = createController({ engine, shouldSkip: () => busy, debounceMs: 5, intervalMs: 60000 });
    controller.start();
    await space.saveSolve(makeSolve(1));
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(server.syncPosts.length, 0);
    busy = false;
    await controller.syncNow();
    controller.stop();
    assert.equal(server.ownRows('ana', 'solves').length, 1);
  });

  it('nunca hay dos ciclos a la vez', async () => {
    const { server, space, engine } = await setup();
    await space.saveSolve(makeSolve(1));
    let concurrent = 0;
    let maxConcurrent = 0;
    const original = server.fetch;
    server.fetch = async (...args) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 15));
      concurrent -= 1;
      return original(...args);
    };
    const controller = createController({ engine, debounceMs: 1, intervalMs: 60000 });
    controller.start();
    await Promise.all([controller.syncNow(), controller.syncNow(), controller.syncNow()]);
    controller.stop();
    assert.equal(maxConcurrent, 1);
  });
});
