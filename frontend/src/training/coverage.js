import { LEVEL } from '../catalog/index.js';
import { STATUS, statusOf } from './selection.js';

/**
 * Cobertura de un conjunto de casos, calculada solo con los registros reales (nunca con un contador
 * aparte). "Practicados" son los casos con al menos un intento guardado; los borrados no cuentan.
 */
export function coverageStats(cases, attempts, progress = {}) {
  const ids = new Set(cases.map((c) => c.id));
  const practiced = new Set(attempts.filter((a) => ids.has(a.caseId) && !a.deletedAt).map((a) => a.caseId));
  const level = (c) => c.catalogCase?.verification.level ?? c.verification?.level;
  return {
    total: cases.length,
    verified: cases.filter((c) => level(c) === LEVEL.CONTRASTED).length,
    pendingValidation: cases.filter((c) => level(c) !== LEVEL.CONTRASTED).length, // una sola fuente o sin verificar
    practiced: practiced.size,
    unpracticed: cases.length - practiced.size,
    pendingLearning: cases.filter((c) => statusOf(progress, c.id) === STATUS.PENDING).length,
  };
}