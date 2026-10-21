/**
 * Formatea milisegundos como tiempo de speedcubing.
 * Trunca (no redondea), como hacen los timers oficiales.
 *   12345 ms, 2 decimales -> "12.34"
 *   83456 ms, 2 decimales -> "1:23.45"
 */
export function formatTime(ms, decimals = 2) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const perSecond = decimals === 3 ? 1000 : 100;
  const unit = 1000 / perSecond;
  const ticks = Math.floor(Math.max(0, ms) / unit);
  const frac = ticks % perSecond;
  const totalSeconds = Math.floor(ticks / perSecond);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const fracStr = String(frac).padStart(decimals, '0');
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}.${fracStr}`
    : `${seconds}.${fracStr}`;
}

/** Formatea un solve o resultado ({ time, penalty }) con su penalización. */
export function formatSolve(solve, decimals = 2) {
  if (!solve) return '—';
  if (solve.penalty === 'DNF') return 'DNF';
  if (solve.penalty === '+2') return `${formatTime(solve.time + 2000, decimals)}+`;
  return formatTime(solve.time, decimals);
}

/** Formatea una estadística: null -> "—", Infinity -> "DNF". */
export function formatStat(value, decimals = 2) {
  if (value == null) return '—';
  if (value === Infinity) return 'DNF';
  return formatTime(value, decimals);
}
