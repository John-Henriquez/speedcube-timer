import { VALIDATION } from './attempts.js';

const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/**
 * Estadísticas de un conjunto de intentos (de una misma zona, caso y modalidad).
 * Usa la mediana y el rango intercuartílico (robustos ante intentos atípicos).
 * Los intentos inválidos cuentan como errores y no entran en los tiempos; los
 * "sin verificar" entran en los tiempos pero se informan aparte.
 */
export function summarizeAttempts(attempts, { minSample = 5 } = {}) {
  const invalid = attempts.filter((a) => a.validation === VALIDATION.INVALID).length;
  const timed = attempts
    .filter((a) => a.validation !== VALIDATION.INVALID && Number.isFinite(a.timeMs))
    .map((a) => a.timeMs)
    .sort((x, y) => x - y);
  const unverified = attempts.filter((a) => a.validation === VALIDATION.UNVERIFIED).length;
  const judged = attempts.length - unverified;

  const median = timed.length ? quantile(timed, 0.5) : null;
  const iqr = timed.length >= 4 ? quantile(timed, 0.75) - quantile(timed, 0.25) : null;

  return {
    attempts: attempts.length,
    timedCount: timed.length,
    invalid,
    unverified,
    errorRate: judged > 0 ? invalid / judged : null, // solo sobre intentos juzgados
    best: timed.length ? timed[0] : null,
    median,
    mean: timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : null,
    spread: median && iqr !== null ? iqr / median : null, // dispersión relativa
    sufficient: timed.length >= minSample, // por debajo, no se debe diagnosticar
  };
}

/** Agrupa intentos (p. ej. por caseId) y resume cada grupo. */
export function summarizeBy(attempts, keyFn = (a) => a.caseId, options) {
  const groups = new Map();
  for (const a of attempts) {
    const key = keyFn(a);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return Object.fromEntries([...groups].map(([key, list]) => [key, summarizeAttempts(list, options)]));
}
