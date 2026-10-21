/**
 * Capa de persistencia. El resto de la app solo importa de aquí.
 * Hoy guarda en IndexedDB (local al navegador); si más adelante se agrega
 * un backend, basta con cambiar la implementación exportada.
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
