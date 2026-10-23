/**
 * Capa de persistencia. El resto de la app solo importa de aquí.
 * Hoy guarda en IndexedDB (local al navegador); la sincronización con el backend
 * se apoya en `getChanges`, `getMeta` y `setMeta`.
 *
 * Los errores de almacenamiento no deben romper el cronómetro: se registran
 * en consola y la sesión sigue funcionando en memoria.
 */
import * as local from './indexedDb.js';

async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[storage] ${label}:`, error);
    return fallback;
  }
}

export const getSolves = () => safe('getSolves', () => local.getSolves(), []);
export const saveSolve = (solve) => safe('saveSolve', () => local.saveSolve(solve));
export const deleteSolve = (id) => safe('deleteSolve', () => local.deleteSolve(id));
export const clearSolves = () => safe('clearSolves', () => local.clearSolves());

export const getAttempts = () => safe('getAttempts', () => local.getAttempts(), []);
export const saveAttempt = (attempt) => safe('saveAttempt', () => local.saveAttempt(attempt));
export const deleteAttempt = (id) => safe('deleteAttempt', () => local.deleteAttempt(id));

export const getChanges = (since) => safe('getChanges', () => local.getChanges(since), { solves: [], attempts: [] });
export const applyRemote = (records, options) => safe('applyRemote', () => local.applyRemote(records, options));
export const getMeta = (key) => safe('getMeta', () => local.getMeta(key), null);
export const setMeta = (key, value) => safe('setMeta', () => local.setMeta(key, value));
