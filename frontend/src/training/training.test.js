import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAlgorithm, crossSolved, f2lSolved, invertAlgorithm, invertMove, llEdgePattern, llOriented,
  solvedState, solvedUpToAuf,
} from '../core/cube/cube.js';
import { solveCross } from '../core/cube/crossSolver.js';
import { OLL_CASES, PLL_CASES } from './cases.js';
import { generateCross, generateCrossPair, generateF2L, generateOll, generatePll } from './generators.js';
import { ZONES, validateSolution } from './zones/index.js';
import { CAPTURE, MODE, VALIDATION, createAttempt } from './attempts.js';
import { summarizeAttempts, summarizeBy } from './stats.js';

const S = solvedState();
const caseState = (alg) => applyAlgorithm(S, invertAlgorithm(alg));

test('cada caso OLL es un caso real de última capa que su algoritmo orienta', () => {
  for (const c of OLL_CASES) {
    const state = caseState(c.alg);
    assert.ok(f2lSolved(state, 'D'), `${c.id}: no debe alterar F2L`);
    assert.ok(!llOriented(state), `${c.id}: debe requerir orientar`);
    assert.equal(llEdgePattern(state), c.edges, `${c.id}: patrón de aristas`);
    assert.ok(llOriented(applyAlgorithm(state, c.alg)), `${c.id}: el algoritmo orienta`);
  }
});

test('cada caso PLL es solo permutación y su algoritmo lo resuelve', () => {
  for (const c of PLL_CASES) {
    const state = caseState(c.alg);
    assert.ok(llOriented(state), `${c.id}: debe estar orientado`);
    assert.ok(!solvedUpToAuf(state), `${c.id}: debe requerir permutar`);
    assert.ok(solvedUpToAuf(applyAlgorithm(state, c.alg)), `${c.id}: el algoritmo resuelve`);
  }
});

test('los PLL mueven las piezas esperadas', () => {
  const moved = (id) => {
    const s = caseState(PLL_CASES.find((c) => c.id === id).alg);
    return [s.cp.filter((v, i) => v !== i).length, s.ep.filter((v, i) => v !== i).length];
  };
  assert.deepEqual(moved('pll-aa'), [3, 0]);
  assert.deepEqual(moved('pll-ua'), [0, 3]);
  assert.deepEqual(moved('pll-ub'), [0, 3]);
  assert.deepEqual(moved('pll-h'), [0, 4]);
  assert.deepEqual(moved('pll-y'), [2, 2]);
});

test('los generadores producen el estado inicial definido de cada zona', () => {
  for (let n = 0; n < 60; n++) {
    const f2l = applyAlgorithm(S, generateF2L().scramble);
    assert.ok(crossSolved(f2l, 'D') && !f2lSolved(f2l, 'D'), 'F2L: cruz resuelta, pares sin resolver');

    const oll = applyAlgorithm(S, generateOll().scramble);
    assert.ok(f2lSolved(oll, 'D') && !llOriented(oll), 'OLL: F2L resuelto, última capa sin orientar');

    const pll = applyAlgorithm(S, generatePll().scramble);
    assert.ok(llOriented(pll) && !solvedUpToAuf(pll), 'PLL: orientado y sin permutar');
  }
  assert.equal(generateCross({ face: 'D' }).color, 'amarillo');
  assert.equal(generateCrossPair().zone, 'cross-pair');
  assert.throws(() => generateOll({ caseId: 'oll-inexistente' }));
});

test('el AUF aleatorio siempre se resuelve con "AUF inverso + algoritmo"', () => {
  for (const generate of [generateOll, generatePll]) {
    for (let n = 0; n < 60; n++) {
      const g = generate();
      const solution = [g.auf ? invertMove(g.auf) : '', g.alg].filter(Boolean).join(' ');
      const zone = ZONES.find((z) => z.id === g.zone);
      assert.ok(validateSolution(zone.id, g.scramble, solution).valid, `${g.caseId} con AUF "${g.auf}"`);
    }
  }
});

test('validateSolution acepta soluciones correctas y rechaza las incorrectas', () => {
  const c = generateCross();
  const fix = solveCross(applyAlgorithm(S, c.scramble), 'D').join(' ');
  assert.ok(validateSolution('cross', c.scramble, fix, { face: 'D' }).valid);
  assert.equal(validateSolution('cross', c.scramble, '', { face: 'D' }).valid, false);

  const f = generateF2L();
  assert.ok(validateSolution('f2l', f.scramble, invertAlgorithm(f.scramble)).valid);
  assert.equal(validateSolution('f2l', f.scramble, '').valid, false);

  const bad = validateSolution('pll', 'R U', 'X Y');
  assert.equal(bad.valid, false);
  assert.match(bad.reason, /no reconocido/);
});

test('cross + primer par se cumple con la cruz y un par, pero no solo con la cruz', () => {
  const c = generateCrossPair();
  assert.equal(validateSolution('cross-pair', c.scramble, '').valid, false);
  // Un cubo resuelto cumple (cruz + 4 pares); un cubo con un giro de D no.
  assert.ok(validateSolution('cross-pair', '', '').valid);
  assert.equal(validateSolution('cross-pair', 'D', '').valid, false);
});

test('createAttempt valida y no inventa datos', () => {
  const a = createAttempt({ zone: 'oll', caseId: 'oll-sune', scramble: 'R', timeMs: 1800 });
  assert.equal(a.capture, CAPTURE.MANUAL);
  assert.equal(a.validation, VALIDATION.UNVERIFIED);
  assert.equal(a.recognitionMs, null);
  assert.equal(a.moves, null);
  assert.equal(a.stageMarks, null);
  assert.throws(() => createAttempt({ zone: 'nada', scramble: 'R', timeMs: 1 }));
  assert.throws(() => createAttempt({ zone: 'oll', scramble: 'R', timeMs: -5 }));
  assert.throws(() => createAttempt({ zone: 'oll', scramble: 'R', timeMs: 1, capture: 'magia' }));
  const k = createAttempt({ zone: 'oll', mode: MODE.KNOWLEDGE, scramble: 'R', timeMs: null });
  assert.equal(k.timeMs, null);
});

const att = (timeMs, validation = VALIDATION.VALID, caseId = 'oll-sune') =>
  createAttempt({ zone: 'oll', caseId, scramble: 'R', timeMs, validation });

test('estadísticas: mediana robusta, errores aparte y datos insuficientes', () => {
  const s = summarizeAttempts([1000, 1200, 1100, 5000, 1150].map((t) => att(t)));
  assert.equal(s.best, 1000);
  assert.equal(s.median, 1150); // el 5000 atípico no la arrastra
  assert.ok(s.mean > 1500);
  assert.equal(s.sufficient, true);
  assert.ok(s.spread > 0);

  const e = summarizeAttempts([att(1000), att(900, VALIDATION.INVALID), att(1100)]);
  assert.equal(e.invalid, 1);
  assert.equal(e.timedCount, 2);
  assert.equal(e.best, 1000); // el intento inválido no cuenta como mejor tiempo
  assert.equal(e.errorRate, 1 / 3);
  assert.equal(e.sufficient, false);

  const u = summarizeAttempts([att(1000, VALIDATION.UNVERIFIED)]);
  assert.equal(u.unverified, 1);
  assert.equal(u.errorRate, null); // nada juzgado: no se inventa una tasa

  const empty = summarizeAttempts([]);
  assert.equal(empty.median, null);
  assert.equal(empty.sufficient, false);
});

test('summarizeBy agrupa por caso', () => {
  const g = summarizeBy([att(1000, VALIDATION.VALID, 'oll-sune'), att(2000, VALIDATION.VALID, 'oll-pi')]);
  assert.equal(g['oll-sune'].best, 1000);
  assert.equal(g['oll-pi'].best, 2000);
});
