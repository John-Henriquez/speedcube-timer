import { useMemo, useState } from 'react';
import {
  dayHeat, goalProgress, groupByDay, longDayLabel, monthGrid, monthLabel, monthSummary, shiftMonth, todayKey,
} from '../core/calendar.js';
import { summarize } from '../core/stats.js';
import { getZone } from '../training/zones/index.js';
import GoalBar from '../components/GoalBar.jsx';
import SessionList from '../components/SessionList.jsx';
import StatsPanel from '../components/StatsPanel.jsx';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Calendario: cada día es una sesión. Muestra cuánto se resolvió y permite revisar el detalle de cada día. */
export default function CalendarPage({ settings, solvesApi, attemptsApi }) {
  const { solves, togglePenalty, remove, removeMany } = solvesApi;
  const today = todayKey();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => groupByDay(solves), [solves]);
  const attemptsByDay = useMemo(() => groupByDay(attemptsApi.attempts), [attemptsApi.attempts]);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const summary = monthSummary(byDay, cursor, settings.dailyGoal);

  const daySolves = byDay[selected] ?? [];
  const dayAttempts = attemptsByDay[selected] ?? [];
  const perZone = dayAttempts.reduce((acc, a) => ({ ...acc, [a.zone]: (acc[a.zone] ?? 0) + 1 }), {});

  return (
    <div className="page calendar">
      <header className="chrome calendar__head">
        <h1>Calendario</h1>
        <div className="calendar__nav">
          <button type="button" className="btn" aria-label="Mes anterior" onClick={() => setCursor(shiftMonth(cursor, -1))}>‹</button>
          <strong className="calendar__month">{monthLabel(cursor)}</strong>
          <button type="button" className="btn" aria-label="Mes siguiente" onClick={() => setCursor(shiftMonth(cursor, 1))}>›</button>
        </div>
      </header>

      <p className="calendar__summary">
        {summary.total} resoluciones · {summary.daysTrained} días entrenados · {summary.goalsMet} con la meta cumplida
      </p>

      <div className="calendar__grid" role="grid" aria-label={monthLabel(cursor)}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar__weekday" role="columnheader">{d}</div>
        ))}
        {grid.flat().map((cell) => {
          const count = (byDay[cell.key] ?? []).length;
          return (
            <button
              key={cell.key}
              type="button"
              className="calendar__day"
              data-heat={dayHeat(count, settings.dailyGoal)}
              data-outside={!cell.inMonth}
              data-today={cell.key === today}
              aria-pressed={cell.key === selected}
              aria-label={`${longDayLabel(cell.key)}: ${count} resoluciones`}
              onClick={() => setSelected(cell.key)}
            >
              <span className="calendar__num">{cell.day}</span>
              {count > 0 && <span className="calendar__count">{count}</span>}
            </button>
          );
        })}
      </div>

      <section className="calendar__detail">
        <h2>{longDayLabel(selected)}</h2>
        <GoalBar label="Meta del día" progress={goalProgress(daySolves.length, settings.dailyGoal)} />
        <div className="panels">
          <StatsPanel title="Estadísticas del día" stats={summarize(daySolves)} decimals={settings.decimals} />
          <SessionList
            title="Resoluciones del día"
            clearLabel="Borrar día"
            solves={daySolves}
            decimals={settings.decimals}
            onPenalty={togglePenalty}
            onDelete={remove}
            onClear={() => removeMany(daySolves.map((s) => s.id))}
          />
        </div>
        <div className="panel">
          <h2>Entrenamiento del día</h2>
          {dayAttempts.length === 0 ? (
            <p className="empty">Sin intentos de entrenamiento este día.</p>
          ) : (
            <ul className="calendar__zones">
              {Object.entries(perZone).map(([zone, n]) => (
                <li key={zone}>{getZone(zone).name}: {n} {n === 1 ? 'intento' : 'intentos'}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
