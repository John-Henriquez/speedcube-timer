/**
 * Fachada de almacenamiento. El resto de la app llama solo a estas funciones y siempre trabaja sobre el espacio
 * ACTIVO (el de invitado o el de la cuenta con sesión). Cambiar de espacio avisa a los hooks para que recarguen
 *
 * Los errores de almacenamiento no deben romper el cronómetro: se registran en consola y la sesión sigue.
 */

import { EVENTS, emit } from '../sync/events.js';
import { spaces } from './spaces.js';

let active = null;

export const activeSpace = () => (active ??= spaces.guest());

export function activate(space) {
  active = space;
  emit(EVENTS.DATA);
  return space;
}

const call = (name, fallback) => async (...args) => {
  try {
    return await activeSpace()[name](...args);
  } catch (error) {
    cconsole.error(`[storage] ${name}:`, error);
    return fallback;
  }
};

export const getSolves = call('getSolves', []);
export const saveSolve = call('saveSolve');
export const deleteSolve = call('deleteSolve');
export const clearSolves = call('clearSolves');
export const getAttempts = call('getAttempts', []);
export const saveAttempt = call('saveAttempt');
export const deleteAttempt = call('deleteAttempt');
export const getMeta = call('getMeta', null);
export const setMeta = call('setMeta');
