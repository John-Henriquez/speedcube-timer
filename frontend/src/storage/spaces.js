import { kv } from './kv.js';
import { createSpace } from './space.js';

/**
 * Registro de espacios. Vive aparte de los datos (en kv) y dice dónde está cada cosa:
 *   guest     el espacio de invitado ACTUAL. El primero es la base original "speedcube-timer" (tus datos de siempre).
 *   accounts  las cuentas que tienen espacio en este navegador (y si quedaron datos sin respaldar).
 *   sealed    espacios de invitado "sellados": sus datos ya se están migrando a una cuenta concreta. Nadie los ve ni
 *             se pueden migrar a otra cuenta; se borran solo cuando el servidor confirma todo.
 */
const KEY = 'speedcube:spaces';
const FIRST_GUEST = 'speedcube-timer';
const cache = new Map();

const open = (name, sync) => {
  if (!cache.has(name)) cache.set(name, createSpace(name, { sync }));
  return cache.get(name);
};
const read = () => {
  const raw = kv.get(KEY) ?? {};
  return { guest: raw.guest ?? FIRST_GUEST, guestSeq: raw.guestSeq ?? 1, accounts: raw.accounts ?? {}, sealed: raw.sealed ?? [] };
};
const write = (registry) => kv.set(KEY, registry);

export const accountSpaceName = (userId) => `speedcube-timer:acct:${userId}`;

export const spaces = {
  /** Espacio de invitado actual. */
  guest: () => open(read().guest, false),

  /** Espacio de una cuenta (se crea la primera vez). Es solo de esa cuenta. */
  account(userId) {
    const registry = read();
    registry.accounts[userId] ??= { name: accountSpaceName(userId), pending: null };
    write(registry);
    return open(registry.accounts[userId].name, true);
  },

  /**
   * Sella el espacio de invitado actual para `accountId` y abre uno nuevo y vacío. Repetirlo con la misma migración
   * no vuelve a sellar (es idempotente). Devuelve el nombre del espacio sellado.
   */
  sealGuest(accountId, migrationId) {
    const registry = read();
    const existing = registry.sealed.find((s) => s.migrationId === migrationId);
    if (existing) return existing.name;
    const name = registry.guest;
    registry.sealed.push({ name, accountId: String(accountId), migrationId, sealedAt: new Date().toISOString() });
    registry.guestSeq += 1;
    registry.guest = `speedcube-timer:guest:${registry.guestSeq}`;
    write(registry);
    return name;
  },

  sealed: (accountId) => read().sealed.filter((s) => s.accountId === String(accountId)),
  sealedSpace: (name) => open(name, false),

  /** Borra un espacio sellado (solo tras confirmar que su contenido está en el servidor). */
  async destroySealed(name) {
    await open(name, false).destroy();
    cache.delete(name);
    const registry = read();
    registry.sealed = registry.sealed.filter((s) => s.name !== name);
    write(registry);
  },

  /** Borra el espacio de una cuenta (cierre de sesión con todo respaldado). */
  async destroyAccount(userId) {
    const registry = read();
    const entry = registry.accounts[userId];
    if (!entry) return;
    await open(entry.name, true).destroy();
    cache.delete(entry.name);
    delete registry.accounts[userId];
    write(registry);
  },

  /** Cuentas con datos sin respaldar que se conservaron aisladas en este navegador. */
  pendingAccounts: () => Object.entries(read().accounts).filter(([, a]) => a.pending).map(([id, a]) => ({ id, ...a.pending })),
  markPending(userId, info) {
    const registry = read();
    registry.accounts[userId] = { ...(registry.accounts[userId] ?? { name: accountSpaceName(userId) }), pending: info };
    write(registry);
  },
  clearPending(userId) {
    const registry = read();
    if (registry.accounts[userId]) registry.accounts[userId].pending = null;
    write(registry);
  },

  /** Cierra las conexiones abiertas y olvida lo que hay en memoria; el registro y los datos se conservan (equivale a recargar la página). */
  closeAll() {
    for (const space of cache.values()) space.close();
    cache.clear();
  },

  /** Solo para pruebas: además de cerrar, olvida el registro. */
  reset() {
    this.closeAll();
    kv.remove(KEY);
  },
};