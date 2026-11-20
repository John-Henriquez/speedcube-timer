import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseResetHash } from './resetLink.js';
import { describeSync, shortTime } from './syncText.js';

const account = (extra = {}) => ({ status: 'account', overview: { pending: 0, error: 0, lastSyncAt: '2026-11-18T15:00:00Z' }, migrations: [], ...extra });

describe('estado de sincronización mostrado al usuario', () => {
  it('invitado: local, y dice que los datos están solo en el dispositivo', () => {
    const info = describeSync({ status: 'guest' });
    assert.deepEqual([info.key, info.label], ['local', 'Local']);
    assert.match(info.detail, /solo en este dispositivo/);
  });

  it('cuenta al día: sincronizado', () => {
    assert.equal(describeSync(account()).key, 'synced');
  });

  it('no dice "sincronizado" mientras no haya habido una primera sincronización correcta', () => {
    const fresh = describeSync(account({ overview: { pending: 0, error: 0, lastSyncAt: null } }));
    assert.deepEqual([fresh.key, fresh.label], ['syncing', 'Sincronizando…']);
    assert.equal(describeSync(account({ overview: null })).key, 'syncing');
    assert.equal(describeSync(account({ overview: { pending: 0, error: 0, lastSyncAt: null }, syncState: 'offline' })).key, 'offline', 'sin red no queda "sincronizando" para siempre');
  });

  it('con pendientes: pendiente, y sin conexión si la red falló', () => {
    const pending = describeSync(account({ overview: { pending: 3, error: 0 } }));
    assert.deepEqual([pending.key, pending.label], ['pending', '3 pendientes']);
    const offline = describeSync(account({ overview: { pending: 3, error: 0 }, syncState: 'offline' }));
    assert.deepEqual([offline.key, offline.tone], ['offline', 'warn']);
    assert.match(offline.label, /3 pendientes/);
  });

  it('errores: lo más grave manda sobre lo pendiente', () => {
    const info = describeSync(account({ overview: { pending: 2, error: 1 } }));
    assert.deepEqual([info.key, info.tone, info.label], ['error', 'bad', '1 con error']);
  });

  it('sesión caducada manda sobre todo lo demás', () => {
    assert.equal(describeSync(account({ sessionExpired: true, overview: { pending: 5, error: 2 } })).key, 'expired');
  });

  it('mientras se migran datos del invitado no dice "sincronizado"', () => {
    const info = describeSync(account({ migrations: [{ status: 'uploading', remaining: 40 }] }));
    assert.equal(info.key, 'migrating');
    assert.match(info.detail, /40/);
    assert.equal(describeSync(account({ migrations: [{ status: 'done', remaining: 0 }] })).key, 'synced');
  });

  it('sin cambios pendientes pero sin conexión no afirma nada de más', () => {
    const info = describeSync(account({ syncState: 'offline' }));
    assert.equal(info.key, 'offline');
    assert.match(info.detail, /No hay cambios pendientes/);
  });

  it('formatea la hora o devuelve null', () => {
    assert.equal(shortTime(null), null);
    assert.equal(shortTime('no es fecha'), null);
    assert.match(shortTime('2026-11-18T15:04:00Z'), /\d{2}:\d{2}/);
  });
});

describe('enlace del correo de recuperación', () => {
  it('lee uid y token del hash', () => {
    assert.deepEqual(parseResetHash('#/reset?uid=Mg&token=abc-123'), { uid: 'Mg', token: 'abc-123' });
  });
  it('ignora hashes que no son de recuperación o están incompletos', () => {
    for (const hash of ['', '#', '#/otra?uid=1&token=2', '#/reset?uid=1', '#/reset?token=2', '#/reset']) {
      assert.equal(parseResetHash(hash), null, hash);
    }
  });
});