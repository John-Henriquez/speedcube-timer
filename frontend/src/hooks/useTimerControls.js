import { useCallback, useEffect, useRef } from 'react';
import { PHASE } from '../core/timer.js';

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

/**
 * Controles del cronómetro: Espacio inicia (mantener y soltar), cualquier tecla detiene,
 * Esc cancela; un toque en el área equivale a Espacio y, corriendo, tocar en cualquier parte detiene.
 * Solo escucha mientras la página que lo usa está montada y `enabled` es true.
 * `busyRef` (opcional) indica a quien sincroniza que el timer está corriendo.
 */
export function useTimerControls({ timer, enabled = true, busyRef = null }) {
  const { press, release, cancel, getPhase, phase } = timer;
  const pointerStartedInArea = useRef(false);

  useEffect(() => {
    if (busyRef) busyRef.current = phase === PHASE.RUNNING;
  }, [phase, busyRef]);
  useEffect(() => () => { if (busyRef) busyRef.current = false; }, [busyRef]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape') {
        cancel();
        return;
      }
      if (getPhase() === PHASE.RUNNING) {
        e.preventDefault();
        if (!e.repeat) press();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) press();
      }
    };
    const onKeyUp = (e) => {
      if (isTyping(e.target) || e.code !== 'Space') return;
      e.preventDefault();
      release();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, press, release, cancel, getPhase]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onPointerDown = () => {
      if (getPhase() === PHASE.RUNNING) press();
    };
    const onPointerUp = () => {
      if (!pointerStartedInArea.current) return;
      pointerStartedInArea.current = false;
      release();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [enabled, press, release, getPhase]);

  const onAreaPointerDown = useCallback(
    (e) => {
      if (!enabled || e.button !== 0 || getPhase() === PHASE.RUNNING) return;
      pointerStartedInArea.current = true;
      press();
    },
    [enabled, press, getPhase],
  );

  return { onAreaPointerDown };
}
