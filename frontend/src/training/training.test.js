import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAlgorithm, crossSolved, f2lSolved, invertMove, llOriented, solvedState, solvedUpToAuf,
} from '../core/cube/cube.js';
import { solveCross } from '../core/cube/crossSolver.js';
import { invertNotation, toFaceTurns } from '../core/cube/notation.js';
import { getCase, getCatalog, scrambleFor } from '../catalog/index.js';
import { ollCaseInfo, pllCaseInfo } from '../catalog/analysis.js';
import { casesForZone } from './cases.js';
import { generateCross, generateCrossPair, generateF2L, generateOll, generatePll } from './generators.js';
import { LEGACY_CASE_IDS, migrateAttempts } from './legacy.js';
import { ZONES, validateSolution } from './zones/index.js';
import { CAPTURE, MODE, VALIDATION, createAttempt } from './attempts.js';
import { summarizeAttempts, summarizeBy } from './stats.js';

const S = solvedState();
const cat = getCatalog();
const caseState = (c, algorithm) => applyAlgorithm(S, scrambleFor(c, algorithm));
const aufSolution = (auf, alg) => [auf ? invertMove(auf) : '', alg].filter(Boolean).join(' ');

test('los 57 OLL y los 21 PLL se entrenan: salen del catálogo y no de una lista propia', () => {
  assert.equal(casesForZone('oll').length, 57);
  assert.equal(casesForZone('pll').length, 21);
  assert.equal(casesForZone('cross'), null);
  assert.deepEqual(casesForZone('oll').map((c) => c.id), cat.oll.map((c) => c.id));
  assert.ok(casesForZone('pll').every((c) => c.family && c.alg));
});

test('cada caso del catálogo es un caso real de última capa (modelo de piezas)', () => {
  for (const c of cat.oll) {
    const state = caseState(c);
    assert.ok(f2lSolved(state, 'D'), `${c.name}: no debe alterar las dos primeras capas`);
    assert.ok(!llOriented(state), `${c.name}: debe requerir orientar`);
    assert.ok(llOriented(applyAlgorithm(state, toFaceTurns(c.recommended.notation))), `${c.name}: el algoritmo orienta`);
  }
  for (const c of cat.pll) {
    const state = caseState(c);
    assert.ok(llOriented(state), `${c.name}: debe estar orientado`);
    assert.ok(!solvedUpToAuf(state), `${c.name}: debe requerir permutar`);
    assert.ok(solvedUpToAuf(applyAlgorithm(state, toFaceTurns(c.recommended.notation))), `${c.name}: el algoritmo resuelve`);
  }
});

test('los PLL mueven las piezas esperadas', () => {
  const moved = (id) => {
    const s = caseState(getCase(id));
    return [s.cp.filter((v, i) => v !== i).length, s.ep.filter((v, i) => v !== i).length];
  };
  assert.deepEqual(moved('pll-aa'), [3, 0]);
  assert.deepEqual(moved('pll-ua'), [0, 3]);
  assert.deepEqual(moved('pll-ub'), [0, 3]);
  assert.deepEqual(moved('pll-h'), [0, 4]);
  assert.deepEqual(moved('pll-y'), [2, 2]);
});

test('cada caso y cada variante verificada se genera y se resuelve con su algoritmo, con cualquier AUF', () => {
  let n = 0;
  for (const c of cat.all) {
    const generate = c.set === 'OLL' ? generateOll : generatePll;
    const zone = c.set === 'OLL' ? 'oll' : 'pll';
    for (const a of c.algorithms.filter((x) => ['contrastado', 'una_fuente'].includes(x.status))) {
      for (let k = 0; k < 4; k++) {
        const g = generate({ caseId: c.id, algorithmId: a.id, rng: () => k / 4 });
        assert.equal(g.caseId, c.id);
        assert.match(g.scramble, /^([URFDLB]['2]?( |$))*$/, `${c.name}: solo giros de cara`);
        assert.ok(validateSolution(zone, g.scramble, aufSolution(g.auf, g.alg)).valid, `${c.name} ${a.notation} AUF "${g.auf}"`);
        n++;
      }
    }
  }
  assert.ok(n > 600, `generaciones comprobadas: ${n}`);
});

test('el sorteo recorre todos los casos, respeta el conjunto restringido y rechaza lo desconocido', () => {
  const seen = new Set();
  for (let i = 0; i < 4000 && seen.size < 57; i++) seen.add(generateOll().caseId);
  assert.equal(seen.size, 57);
  for (let i = 0; i < 50; i++) assert.ok(['oll-27', 'oll-26'].includes(generateOll({ pool: ['oll-27', 'oll-26'] }).caseId));
  assert.throws(() => generateOll({ caseId: 'oll-99' }));
  assert.throws(() => generateOll({ caseId: 'pll-aa' }), /desconocido/); // un PLL no es un OLL
  assert.throws(() => generatePll({ caseId: 'pll-aa', algorithmId: 'nada' }));
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
});

test('validateSolution acepta soluciones correctas (también con anchos y rotaciones) y rechaza las incorrectas', () => {
  const c = generateCross();
  const fix = solveCross(applyAlgorithm(S, c.scramble), 'D').join(' ');
  assert.ok(validateSolution('cross', c.scramble, fix, { face: 'D' }).valid);
  assert.equal(validateSolution('cross', c.scramble, '', { face: 'D' }).valid, false);

  const f = generateF2L();
  assert.ok(validateSolution('f2l', f.scramble, invertNotation(f.scramble)).valid);
  assert.equal(validateSolution('f2l', f.scramble, '').valid, false);

  // Sune escrito con anchos y rotaciones equivalentes sigue siendo válido
  const sune = generateOll({ caseId: 'oll-27', rng: () => 0 });
  assert.ok(validateSolution('oll', sune.scramble, "R U R' U R U2 R'").valid);
  assert.equal(validateSolution('oll', sune.scramble, "R U2 R' U' R U' R'").valid, false); // el de Antisune no resuelve Sune

  const bad = validateSolution('pll', 'R U', 'X Y');
  assert.equal(bad.valid, false);
  assert.match(bad.reason, /no reconocido/);
});

test('cross + primer par se cumple con la cruz y un par, pero no solo con la cruz', () => {
  const c = generateCrossPair();
  assert.equal(validateSolution('cross-pair', c.scramble, '').valid, false);
  assert.ok(validateSolution('cross-pair', '', '').valid);
  assert.equal(validateSolution('cross-pair', 'D', '').valid, false);
});

test('legado: los identificadores antiguos pasan a casos estándar y cada correspondencia está demostrada', () => {
  const OLD_OLL = {
    'oll-linea': "F R U R' U' F'", 'oll-l': "F U R U' R' F'", 'oll-sune': "R U R' U R U2 R'",
    'oll-antisune': "R U2 R' U' R U' R'", 'oll-pi': 'R U2 R2 U\' R2 U\' R2 U2 R', 'oll-h': "R U R' U R U' R' U R U2 R'",
    'oll-u': "R2 D R' U2 R D' R' U2 R'",
  };
  assert.deepEqual(Object.keys(OLD_OLL).sort(), Object.keys(LEGACY_CASE_IDS).sort());
  for (const [oldId, alg] of Object.entries(OLD_OLL)) {
    assert.equal(ollCaseInfo(alg).key, getCase(LEGACY_CASE_IDS[oldId]).key, `${oldId} -> ${LEGACY_CASE_IDS[oldId]}`);
  }
  const OLD_PLL = {
    'pll-aa': "R' F R' B2 R F' R' B2 R2", 'pll-y': "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    'pll-ua': "R U' R U R U R U' R' U' R2", 'pll-ub': "R2 U R U R' U' R' U' R' U R'", 'pll-h': 'R2 U2 R U2 R2 U2 R2 U2 R U2 R2',
  };
  for (const [id, alg] of Object.entries(OLD_PLL)) assert.equal(pllCaseInfo(alg).key, getCase(id).key, id);

  const a = createAttempt({ zone: 'oll', caseId: 'oll-sune', scramble: 'R', timeMs: 1800 });
  const b = createAttempt({ zone: 'oll', caseId: 'oll-27', scramble: 'R', timeMs: 1900 });
  const { attempts, changed } = migrateAttempts([a, b]);
  assert.equal(attempts[0].caseId, 'oll-27');
  assert.equal(attempts[0].timeMs, 1800); // los tiempos se conservan
  assert.equal(changed.length, 1);
  assert.equal(migrateAttempts(attempts).changed.length, 0); // es idempotente
});

test('createAttempt valida y no inventa datos', () => {
  const a = createAttempt({ zone: 'oll', caseId: 'oll-27', scramble: 'R', timeMs: 1800 });
  assert.equal(a.capture, CAPTURE.MANUAL);
  assert.equal(a.validation, VALIDATION.UNVERIFIED);
  assert.equal(a.recognitionMs, null);
  assert.equal(a.moves, null);
  assert.equal(a.stageMarks, null);
  assert.equal(a.algorithm, null); // si no se sabe qué algoritmo se usó, no se inventa
  assert.throws(() => createAttempt({ zone: 'nada', scramble: 'R', timeMs: 1 }));
  assert.throws(() => createAttempt({ zone: 'oll', scramble: 'R', timeMs: -5 }));
  assert.throws(() => createAttempt({ zone: 'oll', scramble: 'R', timeMs: 1, capture: 'magia' }));
  const k = createAttempt({ zone: 'oll', mode: MODE.KNOWLEDGE, scramble: 'R', timeMs: null });
  assert.equal(k.timeMs, null);
});

const att = (timeMs, validation = VALIDATION.VALID, caseId = 'oll-27') =>
  createAttempt({ zone: 'oll', caseId, scramble: 'R', timeMs, validation });

test('estadísticas: mediana robusta, errores aparte y datos insuficientes', () => {
  const s = summarizeAttempts([1000, 1200, 1100, 5000, 1150].map((t) => att(t)));
  assert.equal(s.best, 1000);
  assert.equal(s.median, 1150);
  assert.ok(s.mean > 1500);
  assert.equal(s.sufficient, true);
  assert.ok(s.spread > 0);

  const e = summarizeAttempts([att(1000), att(900, VALIDATION.INVALID), att(1100)]);
  assert.equal(e.invalid, 1);
  assert.equal(e.timedCount, 2);
  assert.equal(e.best, 1000);
  assert.equal(e.errorRate, 1 / 3);
  assert.equal(e.sufficient, false);

  const u = summarizeAttempts([att(1000, VALIDATION.UNVERIFIED)]);
  assert.equal(u.unverified, 1);
  assert.equal(u.errorRate, null); 

  const empty = summarizeAttempts([]);
  assert.equal(empty.median, null);
  assert.equal(empty.sufficient, false);
});

test('summarizeBy agrupa por caso', () => {
  const g = summarizeBy([att(1000, VALIDATION.VALID, 'oll-27'), att(2000, VALIDATION.VALID, 'oll-22')]);
  assert.equal(g['oll-27'].best, 1000);
  assert.equal(g['oll-22'].best, 2000);
});

test('el intento guarda una copia del algoritmo usado y la validación lo respeta', () => {
  const alg = { id: 'oll-27#1', notation: "R U R' U R U2 R'" };
  const a = createAttempt({ zone: 'oll', caseId: 'oll-27', scramble: 'R', timeMs: 1800, algorithm: alg });
  alg.notation = 'cambiado después'; // cambiar el original no altera lo ya guardado
  assert.equal(a.algorithm.notation, "R U R' U R U2 R'");
  assert.equal(createAttempt({ ...a, validation: VALIDATION.VALID }).algorithm.notation, "R U R' U R U2 R'");
  assert.throws(() => createAttempt({ zone: 'oll', scramble: 'R', timeMs: 1, algorithm: { id: 'x', notation: '  ' } }));
});
