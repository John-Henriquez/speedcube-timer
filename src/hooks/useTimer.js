import { useCallback, useEffect, useRef, useState } from 'react';
import { PHASE, initialState, reduce } from '../core/timer.js';

/**
 * Conecta la máquina de estados (core/timer.js) con React.
 * onFinish se llama una vez por cada resultado: { id, time, penalty }.
 */
export function useTimer({ inspection, onFinish }) {
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(() => performance.now());

  const stateRef = useRef(state);
  const optionsRef = useRef({ inspection });
  const finishRef = useRef(onFinish);
  optionsRef.current = { inspection };
  finishRef.current = onFinish;

  const dispatch = useCallback((event) => {
    const t = performance.now();
    const prev = stateRef.current;
    const next = reduce(prev, event, t, optionsRef.current);
    if (next === prev) return;
    stateRef.current = next;
    setState(next);
    setNow(t);
    if (next.resultId !== prev.resultId) finishRef.current?.(next.result);
  }, []);

  // Mientras haya una fase activa, avanzamos el reloj en cada frame.
  const active = state.phase !== PHASE.IDLE && state.phase !== PHASE.STOPPED;
  useEffect(() => {
    if (!active) return undefined;
    let raf;
    const loop = () => {
      dispatch('TICK');
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, dispatch]);

  const press = useCallback(() => dispatch('PRESS'), [dispatch]);
  const release = useCallback(() => dispatch('RELEASE'), [dispatch]);
  const cancel = useCallback(() => dispatch('CANCEL'), [dispatch]);
  const getPhase = useCallback(() => stateRef.current.phase, []);

  return {
    phase: state.phase,
    result: state.result,
    elapsed: state.phase === PHASE.RUNNING ? Math.max(0, now - state.startedAt) : null,
    inspectionElapsed:
      state.inspectionStart != null ? Math.max(0, now - state.inspectionStart) : null,
    press,
    release,
    cancel,
    getPhase,
  };
}
