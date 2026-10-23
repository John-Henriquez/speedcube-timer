import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayHeat, dayKey, goalProgress, groupByDay, longDayLabel, monthGrid, monthSummary, parseDayKey, shiftMonth, todayKey,
} from './calendar.js';

test('dayKey usa el día local, no el de UTC', () => {
  assert.equal(dayKey(new Date(2026, 9, 22, 23, 59, 59)), '2026-10-22');
  assert.equal(dayKey(new Date(2026, 9, 23, 0, 0, 1)), '2026-10-23');
  // un texto ISO vuelve al mismo día local en cualquier zona horaria
  assert.equal(dayKey(new Date(2026, 9, 22, 23, 30).toISOString()), '2026-10-22');
  assert.equal(todayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseDayKey es el inverso de dayKey', () => {
  assert.equal(dayKey(parseDayKey('2026-02-28')), '2026-02-28');
  assert.equal(longDayLabel('2026-10-22').includes('2026'), true);
});

test('groupByDay agrupa por día local y conserva el orden', () => {
  const items = [
    { id: 1, date: new Date(2026, 9, 22, 9).toISOString() },
    { id: 2, date: new Date(2026, 9, 22, 23, 50).toISOString() },
    { id: 3, date: new Date(2026, 9, 23, 0, 10).toISOString() },
  ];
  const g = groupByDay(items);
  assert.deepEqual(g['2026-10-22'].map((x) => x.id), [1, 2]);
  assert.deepEqual(g['2026-10-23'].map((x) => x.id), [3]);
});

test('monthGrid: semanas de lunes a domingo que cubren todo el mes', () => {
  for (const [year, month, days] of [[2026, 9, 31], [2026, 1, 28], [2028, 1, 29], [2026, 11, 31], [2027, 2, 31]]) {
    const weeks = monthGrid(year, month);
    const cells = weeks.flat();
    assert.ok(weeks.every((w) => w.length === 7));
    assert.equal(cells.filter((c) => c.inMonth).length, days, `${year}-${month}`);
    assert.equal(parseDayKey(cells[0].key).getDay(), 1, 'la primera celda es lunes');
    assert.equal(new Set(cells.map((c) => c.key)).size, cells.length, 'sin días repetidos');
  }
  // octubre de 2026 empieza en jueves: la primera semana arranca el lunes 28 de septiembre
  const oct = monthGrid(2026, 9);
  assert.equal(oct[0][0].key, '2026-09-28');
  assert.equal(oct[0][3].key, '2026-10-01');
  assert.equal(oct.length, 5);
  assert.equal(oct.at(-1).at(-1).key, '2026-11-01');
});

test('shiftMonth cruza el cambio de año', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
});

test('goalProgress: porcentaje, barra acotada y metas inválidas', () => {
  assert.deepEqual(goalProgress(0, 50), { count: 0, goal: 50, percent: 0, fill: 0, reached: false });
  assert.equal(goalProgress(25, 50).percent, 50);
  const over = goalProgress(60, 50);
  assert.equal(over.percent, 120);
  assert.equal(over.fill, 1);
  assert.equal(over.reached, true);
  assert.equal(goalProgress(1, 0).goal, 1); // una meta inválida no divide por cero
  assert.equal(goalProgress(1, NaN).goal, 1);
});

test('dayHeat escala con la cercanía a la meta', () => {
  assert.deepEqual([0, 10, 20, 40, 50, 80].map((n) => dayHeat(n, 50)), [0, 1, 2, 3, 4, 4]);
});

test('monthSummary cuenta días entrenados y metas cumplidas solo del mes pedido', () => {
  const byDay = { '2026-10-01': Array(50), '2026-10-02': Array(10), '2026-09-30': Array(99) };
  assert.deepEqual(monthSummary(byDay, { year: 2026, month: 9 }, 50), { total: 60, daysTrained: 2, goalsMet: 1 });
});
