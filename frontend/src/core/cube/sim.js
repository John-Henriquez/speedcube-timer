import { CELL, FACES } from './facelets.js';
import { invertNotation, tokenize } from './notation.js';

/**
 * Simulador geométrico del cubo: 54 pegatinas con posición y normal. Cada movimiento rota en el
 * espacio las pegatinas de una o varias capas; no hay tablas de permutaciones escritas a mano.
 * Soporta toda la notación (giros, anchos, capas y rotaciones), así que sirve de árbitro para
 * verificar algoritmos. El estado es un arreglo de 54 colores (la letra de la cara de cada color).
 */
const NORMAL = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };

// Giro horario visto desde fuera de cada cara, como transformación de coordenadas (x derecha, y arriba, z frente).
const ROT = {
  U: ([x, y, z]) => [-z, y, x],
  D: ([x, y, z]) => [z, y, -x],
  R: ([x, y, z]) => [x, z, -y],
  L: ([x, y, z]) => [x, -z, y],
  F: ([x, y, z]) => [y, -x, z],
  B: ([x, y, z]) => [-y, x, z],
};

const STICKERS = [];
const INDEX = new Map();
const key = (pos, normal) => `${pos.join(',')}|${normal.join(',')}`;
for (const face of FACES) {
  const n = NORMAL[face];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const pos = [x, y, z];
    if (pos.some((v, i) => n[i] !== 0 && v === n[i])) {
      INDEX.set(key(pos, n), STICKERS.length);
      STICKERS.push({ pos, normal: n, face });
    }
  }
}

// Qué rotación y qué capas mueve cada letra de la notación.
const MOVES = {
  U: ['U', (p) => p[1] === 1], D: ['D', (p) => p[1] === -1], R: ['R', (p) => p[0] === 1],
  L: ['L', (p) => p[0] === -1], F: ['F', (p) => p[2] === 1], B: ['B', (p) => p[2] === -1],
  M: ['L', (p) => p[0] === 0], E: ['D', (p) => p[1] === 0], S: ['F', (p) => p[2] === 0],
  r: ['R', (p) => p[0] >= 0], l: ['L', (p) => p[0] <= 0], u: ['U', (p) => p[1] >= 0],
  d: ['D', (p) => p[1] <= 0], f: ['F', (p) => p[2] >= 0], b: ['B', (p) => p[2] <= 0],
  x: ['R', () => true], y: ['U', () => true], z: ['F', () => true],
};

// perm[i] = ranura a la que va la pegatina de la ranura i con un cuarto de vuelta horario.
const PERM = Object.fromEntries(
  Object.entries(MOVES).map(([move, [rot, inLayer]]) => [
    move,
    STICKERS.map((s, i) => (inLayer(s.pos) ? INDEX.get(key(ROT[rot](s.pos), ROT[rot](s.normal))) : i)),
  ]),
);

export const solvedColors = () => STICKERS.map((s) => s.face);

function applyQuarter(colors, move) {
  const next = new Array(54);
  PERM[move].forEach((to, from) => { next[to] = colors[from]; });
  return next;
}

/** Aplica una secuencia completa en notación estándar. */
export function applyNotation(colors, alg) {
  let c = colors;
  for (const { move, turns } of tokenize(alg)) for (let i = 0; i < turns; i++) c = applyQuarter(c, move);
  return c;
}

/** Cuadrícula por cara [fila][columna], con la misma disposición que facelets.js (sirve para dibujar). */
export function toGrid(colors) {
  const grid = Object.fromEntries(FACES.map((f) => [f, Array.from({ length: 3 }, () => Array(3))]));
  STICKERS.forEach((s, i) => {
    const [r, c] = CELL[s.face](s.pos);
    grid[s.face][r][c] = colors[i];
  });
  return grid;
}

// ---------- Orientación del cubo entero ----------
const centerSlot = Object.fromEntries(FACES.map((f) => [f, INDEX.get(key(NORMAL[f], NORMAL[f]))]));
const layoutOf = (colors) => FACES.map((f) => colors[centerSlot[f]]).join('');

// Las 24 orientaciones: cada una con la secuencia de rotaciones que la produce desde el cubo resuelto.
const ORIENTATIONS = new Map();
{
  const start = solvedColors();
  ORIENTATIONS.set(layoutOf(start), '');
  const queue = [[start, '']];
  while (queue.length) {
    const [colors, seq] = queue.shift();
    for (const r of ['x', 'y']) {
      const next = applyNotation(colors, r);
      const k = layoutOf(next);
      if (!ORIENTATIONS.has(k)) {
        const s = `${seq} ${r}`.trim();
        ORIENTATIONS.set(k, s);
        queue.push([next, s]);
      }
    }
  }
}

/** Devuelve el cubo girado entero hasta que los centros queden en su sitio (blanco arriba, verde al frente). */
export function normalize(colors) {
  const seq = ORIENTATIONS.get(layoutOf(colors));
  if (seq === undefined) throw new Error('Centros en una disposición imposible');
  return seq === '' ? colors : applyNotation(colors, invertNotation(seq));
}

export const isSolved = (colors) => colors.every((c, i) => c === STICKERS[i].face);

/** Cubo resuelto salvo, quizá, un giro de la capa superior. */
export function solvedUpToAuf(colors) {
  let c = normalize(colors);
  for (let k = 0; k < 4; k++) {
    if (isSolved(c)) return true;
    c = applyNotation(c, 'U');
  }
  return false;
}

export const stateAfter = (alg, from = solvedColors()) => normalize(applyNotation(from, alg));
export const sameState = (a, b) => a.every((c, i) => c === b[i]);
export const colorAt = (colors, pos, face) => colors[INDEX.get(key(pos, NORMAL[face]))];