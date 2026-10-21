import { PHASE, INSPECTION_MS, DNF_AFTER_MS } from './timer.js';
import { formatTime, formatSolve } from './format.js';

const HINTS = {
  [PHASE.IDLE]: 'Mantén Espacio (o toca y mantén) y suelta para empezar',
  [PHASE.HOLDING]: 'Sigue manteniendo…',
  [PHASE.READY]: 'Suelta para empezar',
  [PHASE.INSPECTING]: 'Mantén y suelta para empezar a resolver',
  [PHASE.RUNNING]: '',
  [PHASE.STOPPED]: 'Espacio para otro intento',
};

/** Qué texto y qué pista mostrar según el estado del cronómetro. */
export function getDisplay({ phase, elapsed, inspectionElapsed, result }, decimals) {
  let text;
  switch (phase) {
    case PHASE.RUNNING:
      text = formatTime(elapsed ?? 0, decimals);
      break;
    case PHASE.INSPECTING: {
      const e = inspectionElapsed ?? 0;
      if (e <= INSPECTION_MS) text = String(Math.ceil((INSPECTION_MS - e) / 1000));
      else if (e <= DNF_AFTER_MS) text = '+2';
      else text = 'DNF';
      break;
    }
    case PHASE.HOLDING:
    case PHASE.READY:
      text = formatTime(0, decimals);
      break;
    default:
      text = result ? formatSolve(result, decimals) : formatTime(0, decimals);
  }
  const tone = phase === PHASE.STOPPED && result?.penalty === 'DNF' ? 'dnf' : phase;
  return { text, hint: HINTS[phase], tone };
}
