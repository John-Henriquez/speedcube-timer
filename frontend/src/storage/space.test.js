import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { makeAttempt, makeSolve } from '../testing/fakeServer.js';
import { kv } from './kv.js';
import { backoffMs, createSpace, SYNCED } from './space.js';
import { spaces } from './spaces.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); // base de datos limpia en cada prueba
  spaces.reset();
  kv.reset();
});

const reopen = (space) => {
  space.close();
  return createSpace(space.name, { sync: space.sync }); // equivale a recargar la página
};
const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);

describe('espacio de invitado', () => {
  it('guarda y conserva solves e intentos entre recargas, sin crear cola de envío', async () => {
    const guest = createSpace('g', { sync: false });
    await guest.saveSolve(makeSolve(1));
    await guest.saveAttempt(makeAttempt(1));
    const again = reopen(guest);
    assert.equal((await again.getSolves()).length, 1);
    assert.equal((await again.getAttempts()).length, 1);
    assert.equal((await again.outboxEntries()).length, 0, 'un invitado nunca encola nada para el servidor');
  });

  it('el borrado es lógico y no cuenta en los visibles', async () => {
    const guest = createSpace('g');
    await guest.saveSolve(makeSolve(1));
    await guest.saveSolve(makeSolve(2));
    await guest.deleteSolve('solve-1');
    assert.deepEqual((await guest.getSolves()).map((s) => s.id), ['solve-2']);
    assert.deepEqual(await guest.count(), { solves: 1, attempts: 0, total: 1 });
  });

  it('abre la base original (v2) sin perder datos y le añade la cola', async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('speedcube-timer', 2);
      req.onupgradeneeded = () => {
        for (const s of ['solves', 'attempts']) req.result.createObjectStore(s, { keyPath: 'id' });
        req.result.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const t = req.result.transaction(['solves', 'meta'], 'readwrite');
        t.objectStore('solves').put({ ...makeSolve(7), updatedAt: '2026-10-01T00:07:00.000Z', deletedAt: null });
        t.objectStore('meta').put({ key: 'caseProgress', value: { 'oll-27': 'aprendido' } });
        t.oncomplete = () => { req.result.close(); resolve(); };
      };
      req.onerror = () => reject(req.error);
    });
    const legacy = createSpace('speedcube-timer');
    assert.equal((await legacy.getSolves())[0].id, 'solve-7');
    assert.deepEqual(await legacy.getMeta('caseProgress'), { 'oll-27': 'aprendido' });
    assert.deepEqual(await legacy.outboxEntries(), []);
  });
});

describe('ciclo de vida del espacio', () => {
  it('un espacio eliminado no se puede reabrir por una llamada rezagada (evita conexiones huérfanas)', async () => {
    const space = createSpace('efimero', { sync: true });
    await space.saveSolve(makeSolve(1));
    await space.destroy();
    await assert.rejects(() => space.outboxStats(), /eliminado/);
    await assert.rejects(() => space.saveSolve(makeSolve(2)), /eliminado/);
    assert.ok(!(await dbNames()).includes('efimero'), 'la base sigue borrada');
    const fresh = createSpace('efimero', { sync: true }); // un espacio nuevo con el mismo nombre parte vacío
    assert.equal((await fresh.count()).total, 0);
    assert.equal((await fresh.outboxEntries()).length, 0);
  });

  it('un espacio cerrado tampoco se reabre solo', async () => {
    const space = createSpace('cerrado');
    await space.saveSolve(makeSolve(1));
    space.close();
    await assert.rejects(() => space.getSolves(), /cerrado/);
  });
});

describe('borrado en bloque', () => {
  it('clearSolves borra lógicamente todas las resoluciones y las deja para sincronizar', async () => {
    const acct = createSpace('a', { sync: true });
    await acct.saveSolve(makeSolve(1));
    await acct.saveSolve(makeSolve(2));
    await acct.saveAttempt(makeAttempt(1));
    const [first] = await acct.dueEntries();
    await acct.ackEntries((await acct.dueEntries()).map((e) => ({ key: e.key, seq: e.seq }))); // todo ya sincronizado
    assert.ok(first);
    await acct.clearSolves();
    assert.deepEqual((await acct.count()), { solves: 0, attempts: 1, total: 1 }, 'los intentos no se tocan');
    assert.deepEqual((await acct.outboxEntries()).map((e) => e.key).sort(), ['solves:solve-1', 'solves:solve-2']);
  });
});

describe('espacio de cuenta: cola de operaciones', () => {
  it('cada escritura queda en la cola y la cola sobrevive a recargar', async () => {
    const acct = createSpace('a', { sync: true });
    await acct.saveSolve(makeSolve(1));
    await acct.saveAttempt(makeAttempt(1));
    await acct.deleteSolve('solve-1');
    const again = reopen(acct);
    const entries = await again.outboxEntries();
    assert.deepEqual(entries.map((e) => e.key).sort(), ['attempts:attempt-1', 'solves:solve-1']);
    assert.ok(entries.every((e) => e.status === 'pending' && e.tries === 0));
    assert.equal(entries.find((e) => e.key === 'solves:solve-1').seq, 2, 'guardar y borrar son dos ediciones del mismo registro');
  });

  it('confirmar solo cierra la entrada si el registro no se editó mientras tanto', async () => {
    const acct = createSpace('a', { sync: true });
    await acct.saveSolve(makeSolve(1));
    const [sent] = await acct.dueEntries();
    await acct.saveSolve(makeSolve(1, { time: 1234 })); // edición posterior al envío
    await acct.ackEntries([{ key: sent.key, seq: sent.seq }]);
    assert.equal((await acct.outboxEntries()).length, 1, 'la edición nueva sigue pendiente');
    const [latest] = await acct.dueEntries();
    await acct.ackEntries([{ key: latest.key, seq: latest.seq }]);
    assert.equal((await acct.outboxEntries()).length, 0);
  });

  it('los fallos usan espera creciente y la entrada no vuelve a estar lista hasta que termina', async () => {
    const acct = createSpace('a', { sync: true });
    await acct.saveSolve(makeSolve(1));
    const key = 'solves:solve-1';
    const waits = [];
    let now = 1_000_000;
    for (let i = 0; i < 4; i += 1) {
      await acct.failEntries([key], 'sin red', { now });
      const [entry] = await acct.outboxEntries();
      waits.push(entry.nextAttemptAt - now);
      assert.equal((await acct.dueEntries({ now: entry.nextAttemptAt - 1 })).length, 0, 'aún en espera');
      assert.equal((await acct.dueEntries({ now: entry.nextAttemptAt })).length, 1, 'ya toca reintentar');
      now = entry.nextAttemptAt;
    }
    assert.deepEqual(waits, [2000, 4000, 8000, 16000]);
    assert.equal(backoffMs(30), 300000, 'tope de 5 minutos');
    assert.equal((await acct.dueEntries({ now: 0, force: true })).length, 1, 'forzar ignora la espera');
  });

  it('un error permanente no se reintenta solo, pero se puede volver a poner en cola', async () => {
    const acct = createSpace('a', { sync: true });
    await acct.saveSolve(makeSolve(1));
    await acct.failEntries(['solves:solve-1'], 'inválido', { permanent: true });
    assert.equal((await acct.dueEntries({ force: true })).length, 0);
    assert.deepEqual(await acct.outboxStats(), { pending: 0, error: 1, due: 0, nextAttemptAt: null, lastError: 'inválido' });
    await acct.retryErrors();
    assert.equal((await acct.dueEntries()).length, 1);
  });

  it('lo que llega del servidor no se encola y no pisa cambios locales sin confirmar', async () => {
    const acct = createSpace('a', { sync: true });
    await acct.saveSolve(makeSolve(1, { time: 5555 })); // cambio local pendiente
    await acct.applyRemote({ solves: [makeSolve(1, { time: 1 }), makeSolve(2)], attempts: [makeAttempt(1)] });
    const solves = await acct.getSolves();
    assert.equal(solves.find((s) => s.id === 'solve-1').time, 5555, 'el cambio local pendiente se conserva');
    assert.equal(solves.find((s) => s.id === 'solve-2').updatedAt, SYNCED);
    assert.deepEqual((await acct.outboxEntries()).map((e) => e.key), ['solves:solve-1'], 'solo lo local está en la cola');
  });

  it('copiar migrados es idempotente: no duplica ni pisa ediciones posteriores', async () => {
    const acct = createSpace('a', { sync: true });
    const items = [{ store: 'solves', record: makeSolve(1) }, { store: 'attempts', record: makeAttempt(1) }];
    await acct.putMigrated(items, 'mig:x');
    await acct.saveSolve(makeSolve(1, { time: 4242 })); // el usuario edita después de copiar
    await acct.putMigrated(items, 'mig:x'); // se repite el paso (p. ej. tras una interrupción)
    assert.deepEqual(await acct.count(), { solves: 1, attempts: 1, total: 2 });
    assert.equal((await acct.getSolves())[0].time, 4242);
    assert.deepEqual(await acct.countTagged('mig:x'), { pending: 2, error: 0 });
  });
});

describe('registro de espacios', () => {
  it('cada cuenta tiene su propia base y el invitado otra', async () => {
    const ana = spaces.account(1);
    const beto = spaces.account(2);
    const guest = spaces.guest();
    await ana.saveSolve(makeSolve(1));
    await beto.saveSolve(makeSolve(2));
    assert.deepEqual((await ana.getSolves()).map((s) => s.id), ['solve-1']);
    assert.deepEqual((await beto.getSolves()).map((s) => s.id), ['solve-2']);
    assert.deepEqual(await guest.getSolves(), []);
    assert.equal(guest.name, 'speedcube-timer', 'el primer invitado es la base original de siempre');
  });

  it('sellar el invitado es idempotente y abre uno nuevo y vacío', async () => {
    await spaces.guest().saveSolve(makeSolve(1));
    const sealed = spaces.sealGuest(1, 'mig:1');
    assert.equal(sealed, 'speedcube-timer');
    assert.equal(spaces.sealGuest(1, 'mig:1'), 'speedcube-timer', 'repetir no vuelve a sellar');
    assert.notEqual(spaces.guest().name, sealed);
    assert.deepEqual(await spaces.guest().getSolves(), []);
    assert.equal((await spaces.sealedSpace(sealed).getSolves()).length, 1);
    assert.deepEqual(spaces.sealed(1).map((s) => s.name), ['speedcube-timer']);
    assert.deepEqual(spaces.sealed(2), [], 'otra cuenta no ve espacios sellados ajenos');
  });

  it('borrar un espacio sellado elimina su base y su registro', async () => {
    await spaces.guest().saveSolve(makeSolve(1));
    const name = spaces.sealGuest(1, 'mig:1');
    await spaces.destroySealed(name);
    assert.deepEqual(spaces.sealed(1), []);
    assert.ok(!(await dbNames()).includes(name));
  });

  it('recuerda qué cuentas conservaron datos sin respaldar', () => {
    spaces.account(5);
    spaces.markPending(5, { username: 'ana', pending: 3, error: 0, migrations: 0 });
    assert.deepEqual(spaces.pendingAccounts().map((a) => [a.id, a.username, a.pending]), [['5', 'ana', 3]]);
    spaces.clearPending(5);
    assert.deepEqual(spaces.pendingAccounts(), []);
  });
});