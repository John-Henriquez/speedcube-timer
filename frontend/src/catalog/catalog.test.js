import test from 'node:test';
import assert from 'node:assert/strict';
import { getCase, getCatalog, LEVEL, OLL_CATEGORIES, PLL_CATEGORIES, scrambleFor } from './index.js';
import { OLL_ROWS, PLL_ROWS } from './data.js';
import { f2lSolved, ollCaseInfo, pllCaseInfo, topFaceUniform } from './analysis.js';
import { applyNotation, normalize, solvedColors, solvedUpToAuf, stateAfter } from '../core/cube/sim.js';
import { invertNotation, isValidNotation, tokenize } from '../core/cube/notation.js';

const cat = getCatalog();
const count = (list, f) => list.reduce((a, c) => ({ ...a, [f(c)]: (a[f(c)] ?? 0) + 1 }), {});

test('integridad: 57 OLL y 21 PLL estándar, sin duplicados ni ausencias', () => {
  assert.deepEqual(cat.oll.map((c) => c.number), Array.from({ length: 57 }, (_, i) => i + 1));
  assert.deepEqual(
    cat.pll.map((c) => c.short).sort(),
    ['Aa', 'Ab', 'E', 'F', 'Ga', 'Gb', 'Gc', 'Gd', 'H', 'Ja', 'Jb', 'Na', 'Nb', 'Ra', 'Rb', 'T', 'Ua', 'Ub', 'V', 'Y', 'Z'],
  );
  assert.equal(new Set(cat.all.map((c) => c.id)).size, 78);
  assert.ok(cat.oll.every((c) => /^OLL \d+$/.test(c.name)) && cat.pll.every((c) => /^PLL [A-Z][a-d]?$/.test(c.name)));
  for (const c of cat.all) assert.ok(c.category && c.recommended, `${c.name} sin categoría o sin algoritmo`);
});

test('categorías primarias de OLL: Dot 8, Mini L 27, Line 15, Cross 7 (suman 57)', () => {
  assert.deepEqual(OLL_CATEGORIES, ['Dot', 'Mini L', 'Line', 'Cross']);
  const n = count(cat.oll, (c) => c.category);
  assert.deepEqual(n, { Dot: 8, 'Mini L': 27, Line: 15, Cross: 7 });
  // Dot = OLL 1-4 y 17-20; Cross = OLL 21-27 (las fuentes los agrupan igual)
  assert.deepEqual(cat.oll.filter((c) => c.category === 'Dot').map((c) => c.number), [1, 2, 3, 4, 17, 18, 19, 20]);
  assert.deepEqual(cat.oll.filter((c) => c.category === 'Cross').map((c) => c.number), [21, 22, 23, 24, 25, 26, 27]);
});

test('familias visuales secundarias de OLL: tamaños que coinciden en las dos fuentes', () => {
  assert.deepEqual(count(cat.oll, (c) => c.shape), {
    Dot: 8, Square: 2, Lightning: 4, Fish: 4, 'Knight Move': 4, OCLL: 7, 'Corners oriented': 2, Awkward: 4,
    P: 4, T: 2, C: 2, W: 2, 'Big Lightning': 2, 'Small L': 6, I: 4,
  });
  // coherencia: toda la familia Dot es categoría Dot y todo OCLL es Cross
  assert.ok(cat.oll.filter((c) => c.shape === 'Dot').every((c) => c.category === 'Dot'));
  assert.ok(cat.oll.filter((c) => c.shape === 'OCLL').every((c) => c.category === 'Cross'));
});

test('categorías de PLL por tipo de permutación: 4 solo aristas, 3 solo esquinas, 14 ambas', () => {
  assert.deepEqual(PLL_CATEGORIES, ['Solo aristas', 'Solo esquinas', 'Aristas y esquinas']);
  assert.deepEqual(count(cat.pll, (c) => c.category), { 'Solo aristas': 4, 'Solo esquinas': 3, 'Aristas y esquinas': 14 });
  assert.deepEqual(cat.pll.filter((c) => c.category === 'Solo aristas').map((c) => c.short).sort(), ['H', 'Ua', 'Ub', 'Z']);
  assert.deepEqual(cat.pll.filter((c) => c.category === 'Solo esquinas').map((c) => c.short).sort(), ['Aa', 'Ab', 'E']);
});

test('OLL completo: 57 patrones distintos que cubren los 216 estados posibles', () => {
  const keys = new Set(cat.oll.map((c) => c.key));
  assert.equal(keys.size, 57);
  // cada patrón pesa 4, 2 o 1 estados según su simetría; +1 por el estado ya orientado
  assert.equal(cat.oll.reduce((s, c) => s + c.classSize, 1), 216);
  // la simetría coincide con la probabilidad publicada: 1/54 -> 4, 1/108 -> 2, 1/216 -> 1
  const weight = { '1/54': 4, '1/108': 2, '1/216': 1 };
  for (const c of cat.oll) assert.equal(c.classSize, weight[c.probability], `${c.name}: ${c.probability}`);
});

test('PLL completo: 21 clases distintas que cubren las 288 permutaciones posibles', () => {
  assert.equal(new Set(cat.pll.map((c) => c.key)).size, 21);
  assert.equal(cat.pll.reduce((s, c) => s + c.classSize, 4), 288); // +4 por el cubo resuelto con AUF
  const all = new Set();
  for (const c of cat.pll) c.recommended.info.states.forEach((s) => all.add(s));
  assert.equal(all.size, 284); // 288 - 4: ninguna permutación aparece en dos casos
  const weight = { '1/18': 16, '1/36': 8, '1/72': 4 };
  for (const c of cat.pll) assert.equal(c.classSize, weight[c.probability], `${c.name}: ${c.probability}`);
});

test('verificación: cada nivel se calcula, y los problemas de las fuentes quedan registrados', () => {
  assert.deepEqual(count(cat.oll, (c) => c.verification.level), { [LEVEL.CONTRASTED]: 55, [LEVEL.ONE_SOURCE]: 2 });
  assert.deepEqual(count(cat.pll, (c) => c.verification.level), { [LEVEL.CONTRASTED]: 21 });
  // los únicos OLL con una sola fuente válida son el 43 y el 44 (speedcubing.org publica un error en cada uno)
  assert.deepEqual(cat.oll.filter((c) => c.verification.level === LEVEL.ONE_SOURCE).map((c) => c.number), [43, 44]);
  const o43 = getCase('oll-43').algorithms.find((a) => a.original === "F U' L' U L F'");
  assert.equal(o43.status, 'invalido');
  assert.match(o43.reason, /dos primeras capas/);
  const o44 = getCase('oll-44').algorithms.find((a) => a.original === "F R U R' U' F'");
  assert.equal(o44.status, 'discrepante');
  assert.match(o44.reason, /OLL 45/);
  assert.equal(getCase('oll-44').recommended.notation, "F U R U' R' F'");
  // 13 y 52 llevan una rotación y fueron falsos negativos de una verificación anterior: ahora coinciden en ambas fuentes
  for (const id of ['oll-13', 'oll-52']) assert.equal(getCase(id).verification.level, LEVEL.CONTRASTED);
});

test('todo algoritmo marcado como verificado supera la verificación y nunca hay uno inválido como recomendado', () => {
  for (const c of cat.all) {
    assert.ok(['contrastado', 'una_fuente'].includes(c.recommended.status), c.name);
    for (const a of c.algorithms) {
      assert.ok(isValidNotation(a.notation), a.notation);
      const info = (c.set === 'OLL' ? ollCaseInfo : pllCaseInfo)(a.notation);
      if (a.status === 'contrastado' || a.status === 'una_fuente') {
        assert.ok(info.ok && info.key === c.key, `${c.name}: ${a.notation}`);
      }
    }
  }
});

test('cada caso se puede reproducir con una mezcla de solo giros de cara que lo deja con su patrón', () => {
  for (const c of cat.all) {
    const scramble = scrambleFor(c);
    assert.ok(tokenize(scramble).every((t) => 'URFDLB'.includes(t.move)), `${c.name}: ${scramble}`);
    // el estado que produce es el caso (mismo patrón, salvo un giro de la capa superior)
    if (c.set === 'OLL') assert.equal(ollCaseInfo(invertNotation(scramble)).key, c.key, c.name);
    else assert.equal(pllCaseInfo(scramble).key, pllCaseInfo(invertNotation(c.recommended.notation)).key, c.name);
  }
});

// Comprobación independiente: se construye el caso con el algoritmo B y se resuelve con otro algoritmo A distinto.
// Si A resuelve el caso de B, ambos tratan el mismo patrón, sin depender de cómo se calculó la "clave" del caso.
const AUF = ['', 'U', 'U2', "U'"];
// Parejas ordenadas (A, B) distintas con A y B verificados, por caso: lo que la prueba debe recorrer entero.
const expectedPairs = (cases, ok) => cases.reduce((s, c) => { const n = c.algorithms.filter((a) => ok.includes(a.status)).length; return s + n * (n - 1); }, 0);

test('OLL: cada algoritmo verificado orienta el caso construido con otro algoritmo del mismo caso (tras un AUF)', () => {
  let checked = 0;
  for (const c of cat.oll) {
    const algs = c.algorithms.filter((a) => a.status === 'contrastado' || a.status === 'una_fuente');
    for (const b of algs) {
      const state = applyNotation(solvedColors(), scrambleFor(c, b));
      assert.ok(!topFaceUniform(normalize(state)), `${c.name}: el caso construido ya está orientado`);
      for (const a of algs) {
        if (a === b) continue;
        const solved = AUF.some((auf) => {
          const after = stateAfter(a.notation, applyNotation(state, auf));
          return f2lSolved(after) && topFaceUniform(after);
        });
        assert.ok(solved, `${c.name}: ${a.notation} no orienta el caso de ${b.notation}`);
        checked++;
      }
    }
  }
  assert.equal(checked, expectedPairs(cat.oll, ['contrastado', 'una_fuente']), 'se comprobaron todas las parejas posibles');
  assert.ok(checked > 0);
});

test('PLL: cada algoritmo verificado resuelve el caso construido con otro algoritmo del mismo caso (con AUF)', () => {
  let checked = 0;
  for (const c of cat.pll) {
    const algs = c.algorithms.filter((a) => a.status === 'contrastado');
    for (const b of algs) {
      const state = applyNotation(solvedColors(), scrambleFor(c, b));
      assert.ok(!solvedUpToAuf(state), `${c.name}: el caso construido ya está resuelto`);
      for (const a of algs) {
        if (a === b) continue;
        assert.ok(AUF.some((auf) => solvedUpToAuf(applyNotation(applyNotation(state, auf), a.notation))), `${c.name}: ${a.notation} no resuelve el caso de ${b.notation}`);
        checked++;
      }
    }
  }
  assert.equal(checked, expectedPairs(cat.pll, ['contrastado']), 'se comprobaron todas las parejas posibles');
  assert.ok(checked > 0);
});

test('control negativo: un algoritmo de OTRO caso no resuelve el caso (la prueba cruzada discrimina)', () => {
  const state = applyNotation(solvedColors(), scrambleFor('oll-27')); // Sune
  const wrong = getCase('oll-26').recommended.notation; // Antisune
  const solvesIt = AUF.some((auf) => {
    const after = stateAfter(wrong, applyNotation(state, auf));
    return f2lSolved(after) && topFaceUniform(after);
  });
  assert.equal(solvesIt, false);
  const pstate = applyNotation(solvedColors(), scrambleFor('pll-ua'));
  assert.equal(AUF.some((auf) => solvedUpToAuf(applyNotation(applyNotation(pstate, auf), getCase('pll-ub').recommended.notation))), false);
});

test('los datos de origen no se alteraron: 57 filas de OLL y 21 de PLL', () => {
  assert.equal(OLL_ROWS.length, 57);
  assert.equal(PLL_ROWS.length, 21);
});

test('alias: solo Sune y Antisune están verificados', () => {
  const verified = cat.oll.flatMap((c) => c.aliases.filter((a) => a.verified).map((a) => `${c.name} ${a.name}`));
  assert.deepEqual(verified, ['OLL 26 Antisune', 'OLL 27 Sune']);
  assert.equal(getCase('oll-27').recommended.notation, "R U R' U R U2 R'");
  assert.equal(getCase('oll-26').recommended.notation, "R U2 R' U' R U' R'");
});