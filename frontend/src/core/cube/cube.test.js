import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAlgorithm, applyMove, crossSolved, f2lSolved, f2lPairs, invertAlgorithm, isSolved,
  llEdgePattern, llOriented, solvedState, solvedUpToAuf,
} from './cube.js';
import { solveCross } from './crossSolver.js';
import { generate3x3 } from '../scramble/3x3.js';

const repeat = (alg, n) => Array(n).fill(alg).join(' ');
const solved = solvedState();

test('cada giro de cara tiene orden 4 y su inverso lo deshace', () => {
  for (const f of 'URFDLB') {
    assert.ok(isSolved(applyAlgorithm(solved, repeat(f, 4))), f);
    assert.ok(isSolved(applyAlgorithm(applyMove(solved, f), `${f}'`)), f);
    assert.deepEqual(applyMove(solved, `${f}2`), applyAlgorithm(solved, `${f} ${f}`));
  }
});

test('identidades conocidas del cubo', () => {
  assert.ok(isSolved(applyAlgorithm(solved, repeat("R U R' U'", 6))));
  assert.ok(isSolved(applyAlgorithm(solved, repeat('R U', 105))));
  assert.ok(isSolved(applyAlgorithm(solved, repeat("F R U R' U' F'", 6))));
  assert.ok(isSolved(applyAlgorithm(solved, repeat("R U R' U R U2 R'", 6))));
  const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
  assert.ok(isSolved(applyAlgorithm(solved, `${tPerm} ${tPerm}`)));
});

test('un algoritmo seguido de su inverso es la identidad', () => {
  for (let n = 0; n < 200; n++) {
    const s = generate3x3(25);
    assert.ok(isSolved(applyAlgorithm(solved, `${s} ${invertAlgorithm(s)}`)));
  }
});

test('invariantes de un cubo válido tras mezclar', () => {
  for (let n = 0; n < 200; n++) {
    const s = applyAlgorithm(solved, generate3x3(25));
    assert.equal(s.co.reduce((a, b) => a + b, 0) % 3, 0);
    assert.equal(s.eo.reduce((a, b) => a + b, 0) % 2, 0);
    assert.deepEqual([...s.cp].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([...s.ep].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  }
});

test('el T-perm solo desplaza 2 esquinas y 2 aristas', () => {
  const s = applyAlgorithm(solved, "R U R' U' R' F R2 U' R' U' R U R' F'");
  assert.equal(s.cp.filter((v, i) => v !== i).length, 2);
  assert.equal(s.ep.filter((v, i) => v !== i).length, 2);
  assert.ok(s.co.every((v) => v === 0) && s.eo.every((v) => v === 0));
});

test('Sune: deja las dos primeras capas intactas y solo gira esquinas', () => {
  const s = applyAlgorithm(solved, "R U R' U R U2 R'");
  assert.ok(f2lSolved(s, 'D'));
  assert.ok(!llOriented(s));
  assert.equal(llEdgePattern(s), 'cruz');
  assert.equal(s.co.filter((v) => v !== 0).length, 3);
});

test('predicados de cruz y pares para cualquier cara', () => {
  for (const f of 'UDLRFB') {
    assert.equal(f2lPairs(f).length, 4);
    assert.ok(f2lSolved(solved, f));
  }
  assert.ok(solvedUpToAuf(applyMove(solved, 'U')));
  assert.ok(!crossSolved(applyMove(solved, 'D'), 'D'));
  assert.ok(crossSolved(applyMove(solved, 'U'), 'D'));
});

test('solveCross resuelve la cruz en 8 movimientos o menos', () => {
  for (let n = 0; n < 100; n++) {
    const s = applyAlgorithm(solved, generate3x3(25));
    const fix = solveCross(s, 'D');
    assert.ok(fix.length <= 8, `largo ${fix.length}`);
    assert.ok(crossSolved(applyAlgorithm(s, fix.join(' ')), 'D'));
  }
});
