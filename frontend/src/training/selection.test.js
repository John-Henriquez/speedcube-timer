import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, filterCases, nextInRound, randomFrom, shuffle, statusOf, weakestCases } from './selection.js';
import { casesForZone } from './cases.js';
import { coverageStats } from './coverage.js';
import { PAGE_SIZE, attemptsOfCase, pageAverage, paginate, toggleDnf } from './postit.js';
import { checkPersonalAlgorithm } from '../catalog/personal.js';
import { getCase } from '../catalog/index.js';
import { VALIDATION, createAttempt } from './attempts.js';

const oll = casesForZone('oll');
const pll = casesForZone('pll');
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

test('filtros: vacío = todos; por categoría y por estado de aprendizaje', () => {
  assert.equal(filterCases(oll, {}).length, 57);
  const dot = filterCases(oll, { categories: ['Dot'] });
  assert.equal(dot.length, 8);
  assert.ok(dot.every((c) => c.family === 'Dot'));
  assert.equal(filterCases(oll, { categories: ['Dot', 'Cross'] }).length, 15);
  assert.equal(filterCases(pll, { categories: ['Solo aristas'] }).length, 4);
  const progress = { 'oll-27': STATUS.MASTERED, 'oll-26': STATUS.LEARNING };
  assert.deepEqual(filterCases(oll, { statuses: [STATUS.MASTERED] }, progress).map((c) => c.id), ['oll-27']);
  assert.equal(filterCases(oll, { statuses: [STATUS.PENDING] }, progress).length, 55); // sin registro = pendiente
  assert.deepEqual(filterCases(oll, { categories: ['Cross'], statuses: [STATUS.LEARNING] }, progress).map((c) => c.id), ['oll-26']);
  assert.equal(statusOf(progress, 'oll-1'), STATUS.PENDING);
});

test('cobertura: una ronda recorre todos los casos antes de repetir ninguno', () => {
  const pool = oll.map((c) => c.id);
  const rng = seeded(7);
  let round = [];
  let last = null;
  for (let r = 0; r < 3; r++) {
    const seen = [];
    for (let i = 0; i < pool.length; i++) {
      const n = nextInRound(round, pool, last, rng);
      seen.push(n.caseId);
      round = n.round;
      last = n.caseId;
    }
    assert.equal(new Set(seen).size, 57, `ronda ${r + 1}: sin repetidos y completa`);
  }
});

test('cobertura: respeta un grupo que cambia y no repite de inmediato el último caso', () => {
  const rng = seeded(3);
  let n = nextInRound([], ['a', 'b', 'c'], null, rng);
  const first = n.caseId;
  // el grupo se reduce: los ya descartados no vuelven a salir
  n = nextInRound(n.round, ['a', 'b', 'c'].filter((x) => x !== first), first, rng);
  assert.notEqual(n.caseId, first);
  // grupo de un solo caso: no queda más remedio que repetirlo
  assert.equal(nextInRound([], ['solo'], 'solo', rng).caseId, 'solo');
  assert.equal(nextInRound([], [], null, rng).caseId, null);
  for (let i = 0; i < 100; i++) { // al empezar otra ronda, el primero nunca es el último de la anterior
    const last = 'b';
    assert.notEqual(nextInRound([], ['a', 'b', 'c'], last, rng).caseId, last);
  }
});

test('sorteo ordinario y mezcla', () => {
  assert.equal(randomFrom([], Math.random), null);
  assert.ok(['x', 'y'].includes(randomFrom(['x', 'y'])));
  assert.deepEqual([...shuffle([1, 2, 3, 4, 5], seeded(1))].sort(), [1, 2, 3, 4, 5]);
});

test('casos más débiles: más errores y más lentos, solo con datos suficientes', () => {
  const row = (id, timedCount, errorRate, median) => ({ case: { id }, stats: { timedCount, errorRate, median } });
  const rows = [row('a', 5, 0.1, 2000), row('b', 5, 0.4, 1500), row('c', 2, 0.9, 9000), row('d', 5, 0.1, 3000), row('e', 0, null, null)];
  assert.deepEqual(weakestCases(rows, { minSample: 3 }), ['b', 'd', 'a']); // 'c' y 'e' no tienen datos suficientes
  assert.deepEqual(weakestCases([], {}), []);
});

test('cobertura de catálogo calculada con registros reales', () => {
  const att = (caseId, extra = {}) => ({ ...createAttempt({ zone: 'oll', caseId, scramble: 'R', timeMs: 1500 }), ...extra });
  const attempts = [att('oll-27'), att('oll-27'), att('oll-26'), att('oll-22', { deletedAt: '2026-10-24T00:00:00Z' }), att('pll-aa')];
  const stats = coverageStats(oll, attempts, { 'oll-27': STATUS.MASTERED });
  assert.equal(stats.total, 57);
  assert.equal(stats.verified, 55); // contrastados
  assert.equal(stats.pendingValidation, 2); // OLL 43 y 44: una sola fuente
  assert.equal(stats.practiced, 2); // oll-27 y oll-26; el borrado y el PLL no cuentan
  assert.equal(stats.unpracticed, 55);
  assert.equal(stats.pendingLearning, 56);
  assert.equal(coverageStats(pll, attempts).practiced, 1);
});

test('post-it: 5 por página, paginación acotada y numeración por caso', () => {
  const mk = (i, extra = {}) => ({ ...createAttempt({ zone: 'oll', caseId: 'oll-27', scramble: 'R', timeMs: 1000 + i, date: new Date(2026, 9, 24, 10, i) }), ...extra });
  const all = [...Array(12).keys()].map((i) => mk(i));
  const other = createAttempt({ zone: 'oll', caseId: 'oll-26', scramble: 'R', timeMs: 5000 });
  const own = attemptsOfCase([...all, other, mk(99, { deletedAt: '2026-10-24T20:00:00Z' })], 'oll', 'oll-27');
  assert.equal(own.length, 12); // ni otro caso ni los borrados
  assert.equal(own[0].number, 12);
  assert.equal(own[0].timeMs, 1011); // el más reciente primero
  assert.equal(PAGE_SIZE, 5);
  const p0 = paginate(own, 0);
  assert.deepEqual([p0.items.length, p0.pages], [5, 3]);
  assert.equal(paginate(own, 2).items.length, 2);
  assert.equal(paginate(own, 99).page, 2); // acotada
  assert.equal(paginate(own, -4).page, 0);
  assert.deepEqual(paginate([], 3), { items: [], page: 0, pages: 1 });
});

test('post-it: promedio sin DNF, sin ceros inventados y que se actualiza al cambiar un intento', () => {
  const a = (t, validation = VALIDATION.VALID) => createAttempt({ zone: 'oll', caseId: 'oll-27', scramble: 'R', timeMs: t, validation });
  assert.deepEqual(pageAverage([]), { average: null, used: 0, excluded: 0 }); // "—", no 0
  assert.deepEqual(pageAverage([a(1500)]), { average: 1500, used: 1, excluded: 0 });
  const items = [a(1000), a(2000), a(9000, VALIDATION.INVALID), a(3000, VALIDATION.UNVERIFIED)];
  assert.deepEqual(pageAverage(items), { average: 2000, used: 3, excluded: 1 }); // el DNF no vale 0
  assert.equal(pageAverage([a(500, VALIDATION.INVALID)]).average, null); // solo DNF
  // marcar DNF y restaurar: el tiempo original se conserva y el promedio vuelve
  const target = items[1];
  const dnf = { ...target, validation: toggleDnf(target) };
  assert.equal(dnf.validation, VALIDATION.INVALID);
  assert.equal(dnf.timeMs, 2000);
  assert.equal(pageAverage([items[0], dnf, items[3]]).average, 2000);
  assert.equal(toggleDnf(dnf), VALIDATION.VALID);
});

test('algoritmos propios: se comprueban con el simulador y no crean casos nuevos', () => {
  const sune = getCase('oll-27');
  const ok = checkPersonalAlgorithm(sune, "R U R' U R U2 R' ", []);
  assert.equal(ok.ok, false); // ya existe en el catálogo
  assert.match(ok.reason, /catálogo/);

  // un error típico: cambiar R por r parece una variante de Sune, pero resuelve OLL 7. Debe rechazarse con ese motivo.
  const looksRight = checkPersonalAlgorithm(sune, "r U R' U R U2 r'", []);
  assert.equal(looksRight.ok, false);
  assert.match(looksRight.reason, /OLL 7/);

  // una variante legítima: el mismo algoritmo con un cambio de agarre (y2 + cara opuesta). Se acepta, con aviso de equivalencia.
  const regrip = checkPersonalAlgorithm(sune, "y2 L U L' U L U2 L'", []);
  assert.equal(regrip.ok, true);
  assert.equal(regrip.normalized, "y2 L U L' U L U2 L'");
  assert.equal(regrip.warnings.length, 1);
  assert.match(regrip.warnings[0], /mismo efecto/);

  // el de Antisune no resuelve Sune, y el mensaje dice cuál resuelve
  const wrong = checkPersonalAlgorithm(sune, "R U2 R' U' R U' R'", []);
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /OLL 26/);

  assert.match(checkPersonalAlgorithm(sune, 'R Q R', []).reason, /no válido/i);
  assert.equal(checkPersonalAlgorithm(sune, '  ', []).ok, false);
  assert.match(checkPersonalAlgorithm(sune, "R U R'", []).reason, /No es un algoritmo de OLL/i); // no conserva F2L? o no es caso
  assert.match(checkPersonalAlgorithm(sune, "R U2' R2' U' R2 U'", []).reason ?? '', /./); // cualquier cosa inválida se rechaza con motivo

  // duplicado entre las propias variantes (se compara la forma normalizada)
  const mine = [{ id: 'p1', notation: "y2 L U L' U L U2 L'" }];
  assert.match(checkPersonalAlgorithm(sune, "y2 L U L' U L U2 L'", mine).reason, /personal/);
  // PLL: un algoritmo de Ua no vale para Ub
  assert.equal(checkPersonalAlgorithm(getCase('pll-ub'), getCase('pll-ua').recommended.notation, []).ok, false);
  assert.equal(checkPersonalAlgorithm(getCase('pll-ua'), getCase('pll-ua').algorithms[1].notation, []).ok, false); // ya existe
  // un Ua con un AUF antes y otro después sigue siendo Ua: variante válida y sin aviso de equivalencia
  const wrapped = checkPersonalAlgorithm(getCase('pll-ua'), "U R U' R U R U R U' R' U' R2 U'", []);
  assert.equal(wrapped.ok, true);
  assert.equal(wrapped.warnings.length, 0);
});

test('algoritmos disponibles: los verificados y los personales; el recomendado manda salvo preferencia explícita', async () => {
  const { usableAlgorithms, chooseAlgorithm } = await import('./algorithms.js');
  const c = getCase('oll-43'); // una fuente: speedcubing.org publica un algoritmo inválido que no debe aparecer
  const list = usableAlgorithms(c);
  assert.ok(list.length >= 1 && list.every((a) => a.status !== 'invalido'));
  assert.ok(!list.some((a) => a.notation === "F U' L' U L F'"));
  assert.equal(chooseAlgorithm(c).notation, c.recommended.notation);

  const sune = getCase('oll-27');
  const mine = [{ id: 'oll-27@p1', notation: "y2 L U L' U L U2 L'" }];
  const userAlgs = { 'oll-27': mine };
  assert.equal(usableAlgorithms(sune, userAlgs).length, usableAlgorithms(sune).length + 1);
  // una variante personal no sustituye al recomendado por sí sola
  assert.equal(chooseAlgorithm(sune, { userAlgs }).notation, sune.recommended.notation);
  // sí cuando el usuario la marca preferida, o la elige expresamente
  assert.equal(chooseAlgorithm(sune, { userAlgs, preferred: { 'oll-27': 'oll-27@p1' } }).id, 'oll-27@p1');
  assert.equal(chooseAlgorithm(sune, { userAlgs, chosenId: 'oll-27@p1', preferred: {} }).id, 'oll-27@p1');
  // si la preferida ya no existe, vuelve al recomendado
  assert.equal(chooseAlgorithm(sune, { preferred: { 'oll-27': 'borrada' } }).notation, sune.recommended.notation);
});