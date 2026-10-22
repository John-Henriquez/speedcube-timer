import { getZone } from './zones/index.js';

export const MODE = Object.freeze({ EXECUTION: 'ejecucion', KNOWLEDGE: 'conocimiento' });
export const CAPTURE = Object.freeze({ MANUAL: 'manual', ASSISTED: 'asistido', AUTOMATIC: 'automatico' });
export const VALIDATION = Object.freeze({ VALID: 'valida', INVALID: 'invalida', UNVERIFIED: 'sin_verificar' });
export const PROTOCOL_VERSION = 1;

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Un intento guarda solo datos originales (lo medido o introducido). Todo lo
 * derivado (medianas, diferencias entre zonas, diagnósticos) se calcula aparte.
 * Los campos opcionales quedan en null cuando no se midieron: nunca se inventan.
 */
export function createAttempt({
  zone, caseId = null, mode = MODE.EXECUTION, scramble, timeMs, recognitionMs = null,
  capture = CAPTURE.MANUAL, validation = VALIDATION.UNVERIFIED, moves = null, stageMarks = null,
  notes = '', id = newId(), date = new Date(),
}) {
  getZone(zone); // lanza si la zona no existe
  if (!Object.values(MODE).includes(mode)) throw new Error(`Modalidad no válida: ${mode}`);
  if (!Object.values(CAPTURE).includes(capture)) throw new Error(`Método de captura no válido: ${capture}`);
  if (!Object.values(VALIDATION).includes(validation)) throw new Error(`Validación no válida: ${validation}`);
  if (mode === MODE.EXECUTION && !(Number.isFinite(timeMs) && timeMs >= 0)) {
    throw new Error('El tiempo debe ser un número en ms mayor o igual a 0.');
  }
  return {
    id, zone, caseId, mode, scramble, timeMs: Number.isFinite(timeMs) ? timeMs : null,
    recognitionMs, capture, validation, moves, stageMarks, notes,
    protocolVersion: PROTOCOL_VERSION, date: new Date(date).toISOString(),
  };
}
