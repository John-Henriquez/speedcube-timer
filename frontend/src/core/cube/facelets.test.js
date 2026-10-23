import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, applyMove, solvedState } from './cube.js';
import { FACES, toFacelets } from './facelets.js';
import { isoPolygons, netCells } from './geometry.js';
import { generateOll, generatePll } from '../../training/generators.js';
import { generate3x3 } from '../scramble/3x3.js';

const S = solvedState();
const row = (g, face, r) => g[face][r];
const col = (g, face, c) => g[face].map((line) => line[c]);
const uniform = (g, face, letter) => g[face].flat().every((x) => x === letter);

test('cubo resuelto: cada cara de un solo color', () => {
  const g = toFacelets(S);
  for (const f of FACES) assert.ok(uniform(g, f, f), f);
});

// Un giro horario de cada cara mueve las franjas vecinas de una forma física conocida.
const strips = {
  U: (g) => [row(g, 'F', 0), row(g, 'L', 0), row(g, 'B', 0), row(g, 'R', 0)], // F recibe lo de R
  R: (g) => [col(g, 'U', 2), col(g, 'F', 2), col(g, 'D', 2), col(g, 'B', 0)],
  F: (g) => [row(g, 'U', 2), col(g, 'R', 0), row(g, 'D', 0), col(g, 'L', 2)],
};

test('U: el frente recibe los colores de la derecha', () => {
  const g = toFacelets(applyMove(S, 'U'));
  assert.ok(uniform(g, 'U', 'U'));
  assert.deepEqual(row(g, 'F', 0), ['R', 'R', 'R']);
  assert.deepEqual(row(g, 'L', 0), ['F', 'F', 'F']);
  assert.deepEqual(row(g, 'B', 0), ['L', 'L', 'L']);
  assert.deepEqual(row(g, 'R', 0), ['B', 'B', 'B']);
  assert.deepEqual(row(g, 'F', 1), ['F', 'F', 'F']); // las capas de abajo no se mueven
});

test('R: arriba recibe los colores del frente', () => {
  const g = toFacelets(applyMove(S, 'R'));
  assert.ok(uniform(g, 'R', 'R'));
  assert.deepEqual(col(g, 'U', 2), ['F', 'F', 'F']);
  assert.deepEqual(col(g, 'F', 2), ['D', 'D', 'D']);
  assert.deepEqual(col(g, 'D', 2), ['B', 'B', 'B']);
  assert.deepEqual(col(g, 'B', 0), ['U', 'U', 'U']);
});

test('F: arriba recibe los colores de la izquierda y la derecha los de arriba', () => {
  const g = toFacelets(applyMove(S, 'F'));
  assert.ok(uniform(g, 'F', 'F'));
  assert.deepEqual(row(g, 'U', 2), ['L', 'L', 'L']);
  assert.deepEqual(col(g, 'R', 0), ['U', 'U', 'U']);
  assert.deepEqual(row(g, 'D', 0), ['R', 'R', 'R']);
  assert.deepEqual(col(g, 'L', 2), ['D', 'D', 'D']);
});

test('D: el frente recibe los colores de la izquierda', () => {
  const g = toFacelets(applyMove(S, 'D'));
  assert.ok(uniform(g, 'D', 'D'));
  assert.deepEqual(row(g, 'F', 2), ['L', 'L', 'L']);
  assert.deepEqual(row(g, 'R', 2), ['F', 'F', 'F']);
  assert.deepEqual(row(g, 'B', 2), ['R', 'R', 'R']);
  assert.deepEqual(row(g, 'L', 2), ['B', 'B', 'B']);
});

test('L: el frente recibe los colores de arriba y arriba los de atrás', () => {
  const g = toFacelets(applyMove(S, 'L'));
  assert.ok(uniform(g, 'L', 'L'));
  assert.deepEqual(col(g, 'F', 0), ['U', 'U', 'U']);
  assert.deepEqual(col(g, 'D', 0), ['F', 'F', 'F']);
  assert.deepEqual(col(g, 'B', 2), ['D', 'D', 'D']);
  assert.deepEqual(col(g, 'U', 0), ['B', 'B', 'B']);
});

test('B: arriba recibe los colores de la derecha y la izquierda los de arriba', () => {
  const g = toFacelets(applyMove(S, 'B'));
  assert.ok(uniform(g, 'B', 'B'));
  assert.deepEqual(row(g, 'U', 0), ['R', 'R', 'R']);
  assert.deepEqual(col(g, 'L', 0), ['U', 'U', 'U']);
  assert.deepEqual(row(g, 'D', 2), ['L', 'L', 'L']);
  assert.deepEqual(col(g, 'R', 2), ['D', 'D', 'D']);
});

test('un cubo mezclado conserva 9 pegatinas de cada color y los centros fijos', () => {
  for (let n = 0; n < 100; n++) {
    const g = toFacelets(applyAlgorithm(S, generate3x3(25)));
    const all = FACES.flatMap((f) => g[f].flat());
    for (const f of FACES) assert.equal(all.filter((x) => x === f).length, 9, f);
    for (const f of FACES) assert.equal(g[f][1][1], f);
  }
});

test('un OLL ya orientado se ve con la cara de arriba de un solo color', () => {
  for (let n = 0; n < 40; n++) {
    const g = generateOll();
    const solved = applyAlgorithm(applyAlgorithm(S, g.scramble), `${g.auf ? (g.auf.endsWith("'") ? g.auf.slice(0, -1) : g.auf.endsWith('2') ? g.auf : `${g.auf}'`) : ''} ${g.alg}`);
    assert.ok(uniform(toFacelets(solved), 'U', 'U'), g.caseId);
    // y el caso sin resolver NO tiene la cara de arriba uniforme
    assert.ok(!uniform(toFacelets(applyAlgorithm(S, g.scramble)), 'U', 'U'), `${g.caseId} sin resolver`);
  }
});

test('un PLL se ve con la cara de arriba uniforme pero los laterales mezclados', () => {
  for (let n = 0; n < 40; n++) {
    const g = generatePll();
    const grid = toFacelets(applyAlgorithm(S, g.scramble));
    assert.ok(uniform(grid, 'U', 'U'), g.caseId);
    assert.ok(!uniform(grid, 'F', 'F') || !uniform(grid, 'R', 'R') || !uniform(grid, 'B', 'B') || !uniform(grid, 'L', 'L'), g.caseId);
  }
});

test('geometría: 54 celdas planas y 27 polígonos isométricos con 4 puntos', () => {
  const g = toFacelets(S);
  assert.equal(netCells(g).length, 54);
  const iso = isoPolygons(g);
  assert.equal(iso.length, 27);
  assert.ok(iso.every((p) => p.points.length === 4 && p.points.flat().every(Number.isFinite)));
  // sin celdas planas superpuestas
  const keys = new Set(netCells(g).map((c) => `${c.x},${c.y}`));
  assert.equal(keys.size, 54);
});
