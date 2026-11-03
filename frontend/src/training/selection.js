/** Estados de aprendizaje de un caso. Son independientes del resultado de los intentos. */
export const STATUS = Object.freeze({
  PENDING: 'pendiente',
  LEARNING: 'aprendiendo',
  PROGRESS: 'en_progreso',
  MASTERED: 'dominado',
});
export const STATUS_ORDER = [STATUS.PENDING, STATUS.LEARNING, STATUS.PROGRESS, STATUS.MASTERED];
export const STATUS_LABEL = {
  [STATUS.PENDING]: 'Pendiente',
  [STATUS.LEARNING]: 'Aprendiendo',
  [STATUS.PROGRESS]: 'En progreso',
  [STATUS.MASTERED]: 'Dominado',
};

/** Estado de un caso; sin registro, pendiente. */
export const statusOf = (progress, id) => progress?.[id] ?? STATUS.PENDING;

/** Casos que cumplen los filtros. Una lista vacía significa "todos". `cases` son vistas con `id` y `family` (categoría). */
export function filterCases(cases, { categories = [], statuses = [] } = {}, progress = {}) {
  return cases.filter(
    (c) => (categories.length === 0 || categories.includes(c.family)) &&
      (statuses.length === 0 || statuses.includes(statusOf(progress, c.id))),
  );
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
+ * Modo cobertura: se recorre todo el grupo en orden aleatorio antes de repetir ningún caso.
+ * `round` son los casos que aún no han salido en la ronda actual. Si el grupo cambia, se descartan
+ * los que ya no pertenecen; al agotarse, empieza otra ronda (sin repetir de inmediato el último caso).
+ */
export function nextInRound(round, pool, last = null, rng = Math.random) {
  let remaining = round.filter((id) => pool.includes(id));
  if (remaining.length === 0) {
    remaining = shuffle(pool, rng);
    if (remaining.length > 1 && remaining[0] === last) remaining.push(remaining.shift());
  }
  const [caseId, ...rest] = remaining;
  return { caseId: caseId ?? null, round: rest };
}

/** Sorteo ordinario (sin garantía de cobertura): uniforme dentro del grupo. */
export const randomFrom = (pool, rng = Math.random) => (pool.length ? pool[Math.floor(rng() * pool.length)] : null);

/**
 * Casos con peores resultados, de peor a mejor: más errores primero y, a igualdad, más lentos.
 * Solo cuentan los casos con datos suficientes (`minSample` intentos con tiempo); sin ellos no se diagnostica.
 * `rows` es la salida de caseRows(): { case: { id }, stats }.
 */
export function weakestCases(rows, { minSample = 3 } = {}) {
  return rows
    .filter((r) => r.stats.timedCount >= minSample)
    .sort((a, b) => (b.stats.errorRate ?? 0) - (a.stats.errorRate ?? 0) || (b.stats.median ?? 0) - (a.stats.median ?? 0))
    .map((r) => r.case.id);
}