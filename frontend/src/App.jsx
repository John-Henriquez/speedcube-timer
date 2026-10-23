import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PHASE } from './core/timer.js';
import { getDisplay } from './core/display.js';
import { generateScramble } from './core/scramble/index.js';
import { summarize } from './core/stats.js';
import { useTimer } from './hooks/useTimer.js';
import { useSolves } from './hooks/useSolves.js';
import { useSettings } from './hooks/useSettings.js';
import { useSync } from './hooks/useSync.js';
import CubeView from './components/CubeView.jsx';
import ScrambleView from './components/ScrambleView.jsx';
import TimerDisplay from './components/TimerDisplay.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import SessionList from './components/SessionList.jsx';
import Settings from './components/Settings.jsx';
import SyncPanel from './components/SyncPanel.jsx';

const PUZZLE = '3x3';

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

export default function App() {
  const { settings, update: updateSettings } = useSettings();
  const { solves, add, togglePenalty, remove, clear } = useSolves();
  const [scramble, setScramble] = useState(() => generateScramble(PUZZLE));

  const scrambleRef = useRef(scramble);
  scrambleRef.current = scramble;

  const newScramble = useCallback(() => setScramble(generateScramble(PUZZLE)), []);

  const handleFinish = useCallback(
    (result) => {
      add({
        time: result.time,
        penalty: result.penalty,
        scramble: scrambleRef.current,
        puzzle: PUZZLE,
      });
      newScramble();
    },
    [add, newScramble],
  );

  const timer = useTimer({ inspection: settings.inspection, onFinish: handleFinish });
  const { press, release, cancel, getPhase } = timer;
  const sync = useSync({ shouldSkip: () => getPhase() === PHASE.RUNNING });

  // Teclado: Espacio inicia (mantener y soltar); cualquier tecla detiene; Esc cancela.
  useEffect(() => {
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
  }, [press, release, cancel, getPhase]);

  // Táctil / ratón: pulsar el área del timer equivale a Espacio; con el timer
  // corriendo, tocar en cualquier parte lo detiene.
  const pointerStartedInArea = useRef(false);
  useEffect(() => {
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
  }, [press, release, getPhase]);

  const handleAreaPointerDown = (e) => {
    if (e.button !== 0 || getPhase() === PHASE.RUNNING) return;
    pointerStartedInArea.current = true;
    press();
  };

  const display = getDisplay(timer, settings.decimals);
  const stats = useMemo(() => summarize(solves), [solves]);

  return (
    <div className="app" data-phase={timer.phase}>
      <header className="chrome topbar">
        <h1>Speedcube Timer</h1>
        <Settings settings={settings} onChange={updateSettings} />
      </header>

      <ScrambleView scramble={scramble} onNew={newScramble} />
      {settings.showCube && <CubeView scramble={scramble} />}

      <TimerDisplay
        tone={display.tone}
        text={display.text}
        hint={display.hint}
        onPointerDown={handleAreaPointerDown}
      />

      <div className="chrome panels">
        <StatsPanel stats={stats} decimals={settings.decimals} />
        <SessionList
          solves={solves}
          decimals={settings.decimals}
          onPenalty={togglePenalty}
          onDelete={remove}
          onClear={clear}
        />
      </div>

      <footer className="chrome footer">
        <SyncPanel sync={sync} />
        <div>v{__APP_VERSION__}</div>
      </footer>
    </div>
  );
}
