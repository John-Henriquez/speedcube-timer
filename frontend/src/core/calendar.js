/**
 * Lógica de días y calendario. Todo en hora LOCAL del usuario: un día es el día de su reloj,
 * no el de UTC (una resolución hecha a las 23:30 pertenece a ese día aunque en UTC sea el siguiente).
 */
const pad = (n) => String(n).padStart(2, '0');

/** Clave "AAAA-MM-DD" del día local de una fecha (Date o texto ISO). */
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = (now = new Date()) => dayKey(now);

/** Fecha local (a las 00:00) de una clave "AAAA-MM-DD". */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Agrupa elementos por día local: { "2026-10-22": [...] }, conservando el orden. */
export function groupByDay(items, getDate = (x) => x.date) {
  const groups = {};
  for (const item of items) (groups[dayKey(getDate(item))] ??= []).push(item);
  return groups;
}

/**
 * Cuadrícula de un mes (semanas de lunes a domingo), con los días de relleno de los meses vecinos.
 * `month` va de 0 (enero) a 11. Cada celda: { key, day, inMonth }.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < total; i += 7) {
    weeks.push(
      Array.from({ length: 7 }, (_, j) => {
        const date = new Date(year, month, 1 - offset + i + j);
        return { key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
      }),
    );
  }
  return weeks;
}

export function shiftMonth({ year, month }, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export const monthLabel = ({ year, month }) =>
  new Date(year, month, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

export const longDayLabel = (key) =>
  parseDayKey(key).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Progreso hacia una meta diaria. `fill` (0 a 1) es para la barra; `percent` puede pasar de 100. */
export function goalProgress(count, goal) {
  const target = Math.max(1, Math.floor(goal) || 1);
  return {
    count,
    goal: target,
    percent: Math.round((count / target) * 100),
    fill: Math.min(1, count / target),
    reached: count >= target,
  };
}

/** Intensidad 0 a 4 para colorear un día según lo cerca que quedó de la meta. */
export function dayHeat(count, goal) {
  if (count <= 0) return 0;
  const ratio = count / Math.max(1, goal);
  if (ratio >= 1) return 4;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

/** Resumen de un mes: días entrenados, días con meta cumplida y total de elementos. */
export function monthSummary(byDay, { year, month }, goal) {
  const prefix = `${year}-${pad(month + 1)}-`;
  const days = Object.entries(byDay).filter(([key]) => key.startsWith(prefix));
  return {
    total: days.reduce((sum, [, list]) => sum + list.length, 0),
    daysTrained: days.filter(([, list]) => list.length > 0).length,
    goalsMet: days.filter(([, list]) => list.length >= goal).length,
  };
}
