/**
 * Correspondencia entre los identificadores que usaba la primera versión del entrenador (con nombres
 * propios) y los casos estándar del catálogo. Cada correspondencia está demostrada en los tests: el
 * algoritmo antiguo resuelve exactamente el patrón del caso estándar. Los PLL conservan su id.
 */
export const LEGACY_CASE_IDS = {
  'oll-linea': 'oll-45',
  'oll-l': 'oll-44',
  'oll-sune': 'oll-27',
  'oll-antisune': 'oll-26',
  'oll-pi': 'oll-22',
  'oll-h': 'oll-21',
  'oll-u': 'oll-23',
};

/** Devuelve la lista con los casos antiguos reasignados y, aparte, solo los intentos que cambiaron. */
export function migrateAttempts(attempts) {
  const changed = [];
  const migrated = attempts.map((a) => {
    const next = LEGACY_CASE_IDS[a.caseId];
    if (!next) return a;
    const updated = { ...a, caseId: next };
    changed.push(updated);
    return updated;
  });
  return { attempts: migrated, changed };
}