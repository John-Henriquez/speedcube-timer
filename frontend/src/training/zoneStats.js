import { MODE, VALIDATION } from './attempts.js';
import { summarizeAttempts, summarizeBy } from './stats.js';

const inZone = (attempts, zoneId) => attempts.filter((a) => a.zone === zoneId);

/** Resumen de una zona: tiempos de las pruebas de ejecución y resultados de las de conocimiento. */
export function zoneSummary(attempts, zoneId) {
  const own = inZone(attempts, zoneId);
  const knowledge = own.filter((a) => a.mode === MODE.KNOWLEDGE);
  return {
    execution: summarizeAttempts(own.filter((a) => a.mode === MODE.EXECUTION)),
    knowledge: {
      total: knowledge.length,
      known: knowledge.filter((a) => a.validation === VALIDATION.VALID).length,
    },
  };
}

/**
 * Una fila por cada caso de la zona (también los aún no practicados, para que se vea qué falta):
 * estadísticas de ejecución del caso y cuántas veces dijo saberlo en las pruebas de conocimiento.
 */
export function caseRows(attempts, zoneId, cases) {
  const own = inZone(attempts, zoneId);
  const execution = summarizeBy(own.filter((a) => a.mode === MODE.EXECUTION));
  const knowledgeAttempts = own.filter((a) => a.mode === MODE.KNOWLEDGE);
  return cases.map((c) => {
    const mine = knowledgeAttempts.filter((a) => a.caseId === c.id);
    return {
      case: c,
      stats: execution[c.id] ?? summarizeAttempts([]),
      knowledge: { total: mine.length, known: mine.filter((a) => a.validation === VALIDATION.VALID).length },
    };
  });
}

export const countByZone = (attempts) =>
  attempts.reduce((acc, a) => ({ ...acc, [a.zone]: (acc[a.zone] ?? 0) + 1 }), {});
