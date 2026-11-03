import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedState } from './cube.js';
import { toFacelets } from './facelets.js';
import { invertNotation, isValidNotation, normalizeNotation, toFaceTurns, tokenize } from './notation.js';
import { applyNotation, isSolved, normalize, sameState, solvedColors, stateAfter, toGrid } from './sim.js';
import { generate3x3 } from '../scramble/3x3.js';

const rep = (alg, n) => Array(n).fill(alg).join(' ');
const solved = solvedColors();

test('notación: tokens, equivalencias y errores', () => {
  assert.deepEqual(tokenize("R U2 F'"), [{ move: 'R', turns: 1 }, { move: 'U', turns: 2 }, { move: 'F', turns: 3 }]);
  assert.equal(normalizeNotation("R2' Rw U2' Fw'"), "R2 r U2 f'"); // R2' = R2, Rw = r
  assert.equal(invertNotation("R U2 r' M x"), "x' M' r U2 R'");
  assert.deepEqual(tokenize('  '), []);
  for (const bad of ['Q', 'R3', 'R22', "R''", 'Rww', 'X', '2R']) assert.equal(isValidNotation(bad), false, bad);
  assert.equal(isValidNotation("R U R' U'"), true);
});

test('el simulador y el modelo de piezas coinciden en cualquier mezcla de giros de cara', () => {
  for (let n = 0; n < 300; n++) {
    const scramble = generate3x3(25);
    const fromSim = toGrid(applyNotation(solved, scramble));
    const fromCubies = toFacelets(applyAlgorithm(solvedState(), scramble));
    assert.deepEqual(fromSim, fromCubies, scramble);
  }
});

test('identidades conocidas con toda la notación', () => {
  const id = (alg) => assert.ok(isSolved(applyNotation(solved, alg)), alg);
  id(rep('x', 4)); id(rep('y', 4)); id(rep('z', 4)); id(rep('M', 4)); id(rep('E', 4)); id(rep('S', 4));
  id(rep('r', 4)); id(rep('l', 4)); id(rep('u', 4)); id(rep('d', 4)); id(rep('f', 4)); id(rep('b', 4));
  id(rep("R U R' U'", 6)); id(rep('R U', 105));
});

test('las identidades de rotación y capas que usa la conversión son ciertas (r = L x, M = R L\' x\'...)', () => {
  const same = (a, b) => assert.ok(sameState(stateAfter(a), stateAfter(b)), `${a} == ${b}`);
  same('r', "L x"); same('l', "R x'"); same('u', 'D y'); same('d', "U y'"); same('f', 'B z'); same('b', "F z'");
  same('M', "R L' x'"); same('E', "U D' y'"); same('S', "F' B z");
  same("r'", "L' x'"); same('M2', 'R2 L2 x2'); same('S2', 'F2 B2 z2');
});

test('toFaceTurns: solo giros de cara y mismo resultado que la secuencia original, para cualquier mezcla de notación', () => {
  const pool = ['U', 'D', 'L', 'R', 'F', 'B', 'u', 'd', 'l', 'r', 'f', 'b', 'M', 'E', 'S', 'x', 'y', 'z'];
  const suffix = ['', "'", '2'];
  for (let n = 0; n < 600; n++) {
    const len = 1 + Math.floor(Math.random() * 18);
    const alg = Array.from({ length: len }, () => pool[Math.floor(Math.random() * pool.length)] + suffix[Math.floor(Math.random() * 3)]).join(' ');
    const converted = toFaceTurns(alg);
    assert.match(converted, /^([URFDLB]['2]?( |$))*$/, `solo caras: ${converted}`);
    assert.ok(sameState(stateAfter(alg), stateAfter(converted)), `${alg}  =>  ${converted}`);
  }
});

test('toFaceTurns simplifica y no inventa movimientos', () => {
  assert.equal(toFaceTurns("R R"), 'R2');
  assert.equal(toFaceTurns("R R'"), '');
  assert.equal(toFaceTurns("R L R"), 'R2 L'); // R y L conmutan
  assert.equal(toFaceTurns('x x x x'), '');
  assert.equal(toFaceTurns("R U R' U'"), "R U R' U'");
});
