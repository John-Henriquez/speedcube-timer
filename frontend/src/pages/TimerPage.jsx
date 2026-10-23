import { useCallback, useMemo, useRef, useState } from 'react';
import { dayKey, goalProgress, todayKey } from '../core/calendar.js';
import { getDisplay } from '../core/display.js';
import { generateScramble } from '../core/scramble/index.js';
import { summarize } from '../core/stats.js';
import { useTimer } from '../hooks/useTimer.js';
import { useTimerControls } from '../hooks/useTimerControls.js';
import CubeView from '../components/CubeView.jsx';
import GoalBar from '../components/GoalBar.jsx';
import ScrambleView from '../components/ScrambleView.jsx';
import SessionList from '../components/SessionList.jsx';
import Settings from '../components/Settings.jsx';
import StatsPanel from '../components/StatsPanel.jsx';
import TimerDisplay from '../components/TimerDisplay.jsx';

const PUZZLE = '3x3';

/** Cronómetro. La sesión es el día de hoy: estadísticas, lista y meta se calculan solo con hoy. */
export default function TimerPage({ settings, updateSettings, solvesApi, busyRef }) {
  const { solves, add, togglePenalty, remove, removeMany } = solvesApi;
  const [scramble, setScramble] = useState(() => generateScramble(PUZZLE));
  const scrambleRef = useRef(scramble);
  scrambleRef.current = scramble;

  const today = todayKey();
  const todaySolves = useMemo(() => solves.filter((s) => dayKey(s.date) === today), [solves, today]);
  const stats = useMemo(() => summarize(todaySolves), [todaySolves]);
  const progress = goalProgress(todaySolves.length, settings.dailyGoal);

  const newScramble = useCallback(() => setScramble(generateScramble(PUZZLE)), []);
  const handleFinish = useCallback(
    (result) => {
      add({ time: result.time, penalty: result.penalty, scramble: scrambleRef.current, puzzle: PUZZLE });
      newScramble();
    },
    [add, newScramble],
  );

  const timer = useTimer({ inspection: settings.inspection, onFinish: handleFinish });
  const { onAreaPointerDown } = useTimerControls({ timer, busyRef });
  const display = getDisplay(timer, settings.decimals);

  return (
    <div className="page">
      <header className="chrome topbar">
        <h1>Speedcube Timer</h1>
        <Settings settings={settings} onChange={updateSettings} />
      </header>

      <GoalBar className="chrome" label="Meta de hoy" progress={progress} />
      <ScrambleView scramble={scramble} onNew={newScramble} />
      {settings.showCube && <CubeView scramble={scramble} />}

      <TimerDisplay tone={display.tone} text={display.text} hint={display.hint} onPointerDown={onAreaPointerDown} />

      <div className="chrome panels">
        <StatsPanel title="Estadísticas de hoy" stats={stats} decimals={settings.decimals} />
        <SessionList
          title="Sesión de hoy"
          clearLabel="Borrar hoy"
          solves={todaySolves}
          decimals={settings.decimals}
          onPenalty={togglePenalty}
          onDelete={remove}
          onClear={() => removeMany(todaySolves.map((s) => s.id))}
        />
      </div>
    </div>
  );
}
