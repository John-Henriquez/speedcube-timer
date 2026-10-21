/** Tiempo efectivo de un solve en ms (Infinity si es DNF). */
export function effectiveTime(solve) {
  if (solve.penalty === 'DNF') return Infinity;
  if (solve.penalty === '+2') return solve.time + 2000;
  return solve.time;
}

/**
 * Promedio de exactamente `solves.length` tiempos, con el recorte WCA:
 * se descartan el mejor y el peor (5 % por lado en promedios largos).
 * Devuelve null si hay menos de 3 tiempos, e Infinity si resulta DNF.
 */
export function averageOf(solves) {
  const n = solves.length;
  if (n < 3) return null;
  const trim = Math.ceil(n * 0.05);
  const times = solves.map(effectiveTime).sort((a, b) => a - b);
  const kept = times.slice(trim, n - trim);
  if (kept[kept.length - 1] === Infinity) return Infinity;
  return kept.reduce((sum, t) => sum + t, 0) / kept.length;
}

/** Promedio de los últimos `n` solves (orden cronológico). null si no hay n. */
export function currentAverage(solves, n) {
  if (solves.length < n) return null;
  return averageOf(solves.slice(-n));
}

/** Mejor promedio de `n` en toda la sesión. null si no hay n solves. */
export function bestAverage(solves, n) {
  if (solves.length < n) return null;
  let best = Infinity;
  for (let i = 0; i + n <= solves.length; i++) {
    const avg = averageOf(solves.slice(i, i + n));
    if (avg !== null && avg < best) best = avg;
  }
  return best;
}

/** Mejor tiempo individual (ignora DNF). null si no hay ninguno válido. */
export function bestSingle(solves) {
  const valid = solves.map(effectiveTime).filter(Number.isFinite);
  return valid.length ? Math.min(...valid) : null;
}

/** Media de los tiempos válidos (ignora DNF). null si no hay ninguno. */
export function sessionMean(solves) {
  const valid = solves.map(effectiveTime).filter(Number.isFinite);
  return valid.length ? valid.reduce((s, t) => s + t, 0) / valid.length : null;
}

export function summarize(solves) {
  return {
    count: solves.length,
    best: bestSingle(solves),
    mean: sessionMean(solves),
    ao5: currentAverage(solves, 5),
    ao12: currentAverage(solves, 12),
    bestAo5: bestAverage(solves, 5),
    bestAo12: bestAverage(solves, 12),
  };
}
