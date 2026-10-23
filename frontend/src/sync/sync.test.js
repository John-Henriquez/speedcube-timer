import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttempt } from '../training/attempts.js';

const storage = await import('../storage/index.js');
const { saveSyncConfig } = await import('./config.js');
const { syncNow } = await import('./syncClient.js');
const { attemptFromServer, attemptToServer, solveFromServer, solveToServer } = await import('./mapping.js');

const CONFIG = { serverUrl: 'http://casa:8000', token: 'abc' };
const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const resetCursors = async () => {
  for (const k of ['lastPushAt', 'lastServerTime', 'lastSyncAt']) await storage.setMeta(k, null);
};

/** Servidor falso con el mismo contrato que /api/health/ y /api/sync/ del backend. */
function fakeServer({ auth = true } = {}) {
  const rows = { solves: new Map(), attempts: new Map() };
  const calls = [];
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 22, 12, 0, ++tick)).toISOString();
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path: u.pathname, method: opts.method ?? 'GET', body, search: u.search });
    if (u.pathname === '/api/health/') return json({ status: 'ok' });
    if (!auth) return json({ detail: 'no autorizado' }, 401);
    if (opts.method === 'POST') {
      body.solves.forEach((s) => rows.solves.set(s.id, { ...s, updated_at: stamp() }));
      body.attempts.forEach((a) => rows.attempts.set(a.id, { ...a, updated_at: stamp() }));
      return json({ server_time: stamp() });
    }
    const since = u.searchParams.get('since');
    const pick = (m) => [...m.values()].filter((r) => !since || r.updated_at > since);
    return json({ server_time: stamp(), solves: pick(rows.solves), attempts: pick(rows.attempts) });
  };
  return { fetchImpl, rows, calls };
}

const remoteSolve = (id, extra = {}) => ({
  id, session: null, puzzle: '3x3', time_ms: 9000, penalty: null, scramble: 'R',
  solved_at: '2026-10-21T08:00:00Z', deleted_at: null, updated_at: '2026-10-21T08:00:01Z', ...extra,
});

test('sin configurar no hace nada', async () => {
  await saveSyncConfig({ serverUrl: '', token: '' });
  const s = fakeServer();
  assert.deepEqual(await syncNow({ fetchImpl: s.fetchImpl }), { status: 'not_configured' });
  assert.equal(s.calls.length, 0);
});

test('sin conexión: informa "offline" y no mueve las marcas', async () => {
  await saveSyncConfig(CONFIG);
  await resetCursors();
  const down = async () => { throw new TypeError('fallo de red'); };
  assert.equal((await syncNow({ fetchImpl: down })).status, 'offline');
  assert.equal(await storage.getMeta('lastServerTime'), null);
});

test('sube resoluciones e intentos traducidos al formato de la API', async () => {
  await saveSyncConfig(CONFIG);
  await resetCursors();
  await storage.saveSolve({ id: 's-1', time: 12345.678, penalty: '+2', scramble: 'R U', date: '2026-10-22T10:00:00.000Z', puzzle: '3x3', session: 'default' });
  await storage.saveAttempt(createAttempt({ id: 'a-1', zone: 'oll', caseId: 'oll-sune', scramble: 'R', timeMs: 1840.9, date: '2026-10-22T10:05:00.000Z' }));
  const s = fakeServer();
  const result = await syncNow({ fetchImpl: s.fetchImpl });
  assert.equal(result.status, 'ok');
  assert.equal(result.pushed.solves, 1);
  assert.deepEqual(
    (({ time_ms, penalty, solved_at, session }) => ({ time_ms, penalty, solved_at, session }))(s.rows.solves.get('s-1')),
    { time_ms: 12345, penalty: '+2', solved_at: '2026-10-22T10:00:00.000Z', session: null },
  );
  const a = s.rows.attempts.get('a-1');
  assert.equal(a.case_id, 'oll-sune');
  assert.equal(a.time_ms, 1840);
  assert.equal(a.moves, null); // lo no medido sigue siendo null
  assert.equal(a.attempted_at, '2026-10-22T10:05:00.000Z');
});

test('baja lo de otros dispositivos y no lo vuelve a subir', async () => {
  await saveSyncConfig(CONFIG);
  await resetCursors();
  const s = fakeServer();
  s.rows.solves.set('remote-1', remoteSolve('remote-1'));
  await syncNow({ fetchImpl: s.fetchImpl });
  const local = (await storage.getSolves()).find((x) => x.id === 'remote-1');
  assert.equal(local.time, 9000);
  assert.equal(local.date, '2026-10-21T08:00:00.000Z');
  await syncNow({ fetchImpl: s.fetchImpl });
  const lastPost = s.calls.filter((c) => c.method === 'POST').pop();
  assert.ok(!lastPost.body.solves.some((x) => x.id === 'remote-1'), 'lo bajado no debe subirse otra vez');
});

test('un borrado local viaja al servidor y uno remoto oculta el registro local', async () => {
  await saveSyncConfig(CONFIG);
  await resetCursors();
  const s = fakeServer();
  await syncNow({ fetchImpl: s.fetchImpl });
  await storage.deleteSolve('s-1');
  await syncNow({ fetchImpl: s.fetchImpl });
  assert.ok(s.rows.solves.get('s-1').deleted_at, 'el servidor debe recibir el borrado');

  // Otro dispositivo borra 'remote-1' (ya lo teníamos localmente, bajado antes) después de nuestra última descarga.
  assert.ok((await storage.getSolves()).some((x) => x.id === 'remote-1'));
  s.rows.solves.set('remote-1', remoteSolve('remote-1', { deleted_at: '2026-10-22T09:00:00Z', updated_at: '2099-01-01T00:00:00Z' }));
  await syncNow({ fetchImpl: s.fetchImpl });
  assert.ok(!(await storage.getSolves()).some((x) => x.id === 'remote-1'));
});

test('sesión caducada: informa "unauthorized" y no mueve las marcas', async () => {
  await saveSyncConfig(CONFIG);
  await storage.setMeta('lastServerTime', 'marca');
  const s = fakeServer({ auth: false });
  assert.equal((await syncNow({ fetchImpl: s.fetchImpl })).status, 'unauthorized');
  assert.equal(await storage.getMeta('lastServerTime'), 'marca');
});

test('una edición hecha durante la sincronización no se pisa con la copia del servidor', async () => {
  await saveSyncConfig(CONFIG);
  await resetCursors();
  const base = { id: 'p-1', time: 10000, penalty: null, scramble: 'R', date: '2026-10-22T11:00:00.000Z', puzzle: '3x3', session: 'default' };
  await storage.saveSolve(base);
  const s = fakeServer();
  const racing = async (url, opts = {}) => {
    if (!opts.method && url.includes('/api/sync/')) {
      await wait();
      await storage.saveSolve({ ...base, penalty: 'DNF' }); // el usuario edita mientras se baja
    }
    return s.fetchImpl(url, opts);
  };
  await syncNow({ fetchImpl: racing });
  assert.equal((await storage.getSolves()).find((x) => x.id === 'p-1').penalty, 'DNF');
  await syncNow({ fetchImpl: s.fetchImpl });
  assert.equal(s.rows.solves.get('p-1').penalty, 'DNF', 'la edición llega al servidor en la siguiente sincronización');
});

test('traducción: ida y vuelta sin perder datos', () => {
  const a = createAttempt({ zone: 'pll', caseId: 'pll-ua', scramble: 'R', timeMs: 2100, recognitionMs: 400, validation: 'valida', capture: 'asistido', notes: 'x' });
  const back = attemptFromServer({ ...attemptToServer(a), updated_at: 'ignorado' });
  for (const k of ['id', 'zone', 'caseId', 'mode', 'timeMs', 'recognitionMs', 'capture', 'validation', 'moves', 'stageMarks', 'notes', 'date']) {
    assert.deepEqual(back[k], a[k], k);
  }
  const solve = { id: 's', time: 8000, penalty: null, scramble: '', date: '2026-10-22T10:00:00.000Z', puzzle: '3x3' };
  assert.equal(solveFromServer(solveToServer(solve)).time, 8000);
  assert.equal(solveToServer({ ...solve, time: 8000.99 }).time_ms, 8000);
});
