/**
 * Máquina de estados del cronómetro. Lógica pura: no usa React ni el DOM.
 *
 * Flujo normal:   idle -> holding -> ready -> running -> stopped
 * Con inspección: idle -> holding -> inspecting -> holding -> ready -> running -> stopped
 *
 * Eventos: PRESS, RELEASE, TICK, CANCEL.
 */
export const PHASE = Object.freeze({
  IDLE: 'idle',
  HOLDING: 'holding',
  READY: 'ready',
  INSPECTING: 'inspecting',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

export const HOLD_MS = 300; // tiempo que hay que mantener para quedar "listo"
export const INSPECTION_MS = 15000; // inspección reglamentaria
export const DNF_AFTER_MS = 17000; // pasado este punto, la inspección es DNF

export const initialState = Object.freeze({
  phase: PHASE.IDLE,
  fromInspection: false,
  holdStart: null,
  inspectionStart: null,
  startedAt: null,
  penalty: null,
  result: null,
  resultId: 0,
});

/** Penalización según el tiempo de inspección usado (ms). */
export function inspectionPenalty(elapsed) {
  if (elapsed <= INSPECTION_MS) return null;
  if (elapsed <= DNF_AFTER_MS) return '+2';
  return 'DNF';
}

function finish(state, result) {
  const resultId = state.resultId + 1;
  return { ...initialState, phase: PHASE.STOPPED, resultId, result: { id: resultId, ...result } };
}

export function reduce(state, event, now, options = {}) {
  const useInspection = Boolean(options.inspection);

  switch (event) {
    case 'PRESS':
      switch (state.phase) {
        case PHASE.IDLE:
        case PHASE.STOPPED:
          return { ...state, phase: PHASE.HOLDING, fromInspection: false, holdStart: now };
        case PHASE.INSPECTING:
          return { ...state, phase: PHASE.HOLDING, fromInspection: true, holdStart: now };
        case PHASE.RUNNING:
          return finish(state, { time: now - state.startedAt, penalty: state.penalty });
        default:
          return state;
      }

    case 'RELEASE':
      switch (state.phase) {
        case PHASE.HOLDING:
          if (state.fromInspection) return { ...state, phase: PHASE.INSPECTING, holdStart: null };
          if (useInspection) {
            return { ...state, phase: PHASE.INSPECTING, holdStart: null, inspectionStart: now };
          }
          return { ...state, phase: PHASE.IDLE, holdStart: null };
        case PHASE.READY:
          return {
            ...state,
            phase: PHASE.RUNNING,
            startedAt: now,
            holdStart: null,
            inspectionStart: null,
            penalty: state.fromInspection ? inspectionPenalty(now - state.inspectionStart) : null,
          };
        default:
          return state;
      }

    case 'TICK':
      if (
        state.phase === PHASE.HOLDING &&
        now - state.holdStart >= HOLD_MS &&
        (!useInspection || state.fromInspection)
      ) {
        return { ...state, phase: PHASE.READY };
      }
      if (state.phase === PHASE.INSPECTING && now - state.inspectionStart > DNF_AFTER_MS) {
        return finish(state, { time: 0, penalty: 'DNF' });
      }
      return state;

    case 'CANCEL':
      if (
        state.phase === PHASE.HOLDING ||
        state.phase === PHASE.READY ||
        state.phase === PHASE.INSPECTING
      ) {
        return {
          ...state,
          phase: PHASE.IDLE,
          fromInspection: false,
          holdStart: null,
          inspectionStart: null,
        };
      }
      return state;

    default:
      return state;
  }
}
