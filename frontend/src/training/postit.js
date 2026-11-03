import { VALIDATION } from './attempts.js';

export const PAGE_SIZE = 5;

/**
 * Intentos de un caso concreto de una zona (o de la zona entera si no trabaja con casos: caseId null),
 * del más reciente al más antiguo y con su número de orden. Nunca mezcla casos distintos.
 */
export function attemptsOfCase(attempts, zone, caseId = null) {
  const own = attempts.filter((a) => a.zone === zone && (a.caseId ?? null) === (caseId ?? null) && !a.deletedAt);
  own.sort((a, b) => a.date.localeCompare(b.date));
  return own.map((a, i) => ({ ...a, number: i + 1 })).reverse();
}

/** Página de intentos (la primera es la más reciente). Acota la página pedida a las que existen. */
export function paginate(list, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: list.slice(current * size, current * size + size), page: current, pages };
}

/**
 * Promedio aritmético de los intentos válidos de la página. Los marcados como DNF (inválidos) no cuentan,
 * ni valen cero; los intentos de entrenamiento no llevan penalizaciones +2. Sin intentos válidos, null
 * (se muestra "—"), nunca 0. Es un indicador local de esos intentos, no un ao5 oficial.
 */
export function pageAverage(items) {
  const valid = items.filter((a) => a.validation !== VALIDATION.INVALID && Number.isFinite(a.timeMs));
  return {
    average: valid.length ? valid.reduce((s, a) => s + a.timeMs, 0) / valid.length : null,
    used: valid.length,
    excluded: items.length - valid.length,
  };
}

/** Un DNF se puede deshacer: el tiempo original nunca se toca, solo cambia la validación. */
export const toggleDnf = (attempt) => (attempt.validation === VALIDATION.INVALID ? VALIDATION.VALID : VALIDATION.INVALID);