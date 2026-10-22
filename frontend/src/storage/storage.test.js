import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttempt } from '../training/attempts.js';

// Simula un navegador con una base de la versión 1 (solo resoluciones, sin updatedAt).
await new Promise((resolve, reject) => {
  const req = indexedDB.open('speedcube-timer', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('solves', { keyPath: 'id' });
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('solves', 'readwrite');
    tx.objectStore('solves').put({ id: 'viejo-1', time: 12340, penalty: null, scramble: 'R U', date: '2026-10-01T10:00:00.000Z' });
    tx.oncomplete = () => { db.close(); resolve(); };
  };
  req.onerror = () => reject(req.error);
});

const storage = await import('./index.js');
const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const attempt = (extra = {}) => createAttempt({ zone: 'oll', caseId: 'oll-sune', scramble: 'R', timeMs: 1800, ...extra });

test('migración v1 -> v2: conserva las resoluciones y les agrega updatedAt', async () => {
  const solves = await storage.getSolves();
  assert.equal(solves.length, 1);
  assert.equal(solves[0].id, 'viejo-1');
  assert.equal(solves[0].time, 12340);
  assert.equal(solves[0].updatedAt, '2026-10-01T10:00:00.000Z');
});

test('guarda intentos en orden cronológico y sella updatedAt', async () => {
  const b = attempt({ date: '2026-10-22T11:00:00Z' });
  const a = attempt({ date: '2026-10-22T10:00:00Z' });
  await storage.saveAttempt(b);
  await storage.saveAttempt(a);
  const list = await storage.getAttempts();
  assert.deepEqual(list.map((x) => x.id), [a.id, b.id]);
  assert.ok(list.every((x) => typeof x.updatedAt === 'string'));
  assert.equal(list[0].timeMs, 1800);
  assert.equal(list[0].moves, null); // lo no medido sigue siendo null
});

test('borrado lógico: oculta el registro pero deja la marca para sincronizar', async () => {
  const a = attempt();
  await storage.saveAttempt(a);
  await storage.deleteAttempt(a.id);
  assert.ok(!(await storage.getAttempts()).some((x) => x.id === a.id));
  const { attempts } = await storage.getChanges(null);
  const tombstone = attempts.find((x) => x.id === a.id);
  assert.ok(tombstone?.deletedAt, 'debe quedar la marca de borrado');
  await storage.deleteAttempt(a.id); // repetir no falla ni cambia nada
  await storage.deleteAttempt('no-existe');
});

test('getChanges(since) devuelve solo lo modificado después, borrados incluidos', async () => {
  await wait();
  const since = new Date().toISOString();
  await wait();
  const nuevo = attempt();
  await storage.saveAttempt(nuevo);
  await storage.deleteSolve('viejo-1');
  const changes = await storage.getChanges(since);
  assert.deepEqual(changes.attempts.map((x) => x.id), [nuevo.id]);
  assert.equal(changes.solves.length, 1);
  assert.ok(changes.solves[0].deletedAt);
  assert.deepEqual((await storage.getChanges(new Date(Date.now() + 1000).toISOString())).solves, []);
});

test('un cambio de validación actualiza el registro sin duplicarlo', async () => {
  const a = attempt();
  await storage.saveAttempt(a);
  await wait();
  await storage.saveAttempt({ ...a, validation: 'valida' });
  const same = (await storage.getAttempts()).filter((x) => x.id === a.id);
  assert.equal(same.length, 1);
  assert.equal(same[0].validation, 'valida');
});

test('clearSolves marca todo como borrado en vez de eliminarlo', async () => {
  await storage.saveSolve({ id: 'x1', time: 9000, penalty: null, scramble: '', date: '2026-10-22T09:00:00.000Z' });
  await storage.clearSolves();
  assert.deepEqual(await storage.getSolves(), []);
  const { solves } = await storage.getChanges(null);
  assert.ok(solves.find((s) => s.id === 'x1')?.deletedAt);
});

test('meta guarda y devuelve valores', async () => {
  assert.equal(await storage.getMeta('lastSync'), null);
  await storage.setMeta('lastSync', '2026-10-22T12:00:00.000Z');
  assert.equal(await storage.getMeta('lastSync'), '2026-10-22T12:00:00.000Z');
});
