import { invertNotation, tokenize } from '../core/cube/notation.js';
import { colorAt, normalize, solvedColors, solvedUpToAuf, stateAfter, toGrid } from '../core/cube/sim.js';

/**
 * Análisis de algoritmos con el simulador. Para cada algoritmo se calcula qué caso resuelve
 * realmente, sin fiarse del nombre con el que lo publica una fuente.
 */
const SIDES = ['F', 'R', 'B', 'L'];

/** Dos primeras capas resueltas (cubo normalizado: cruz abajo, blanco arriba). */
export function f2lSolved(colors) {
  const g = toGrid(colors);
  return g.D.flat().every((c) => c === 'D') && SIDES.every((f) => [1, 2].every((r) => g[f][r].every((c) => c === f)));
}
export const topFaceUniform = (colors) => toGrid(colors).U.flat().every((c) => c === 'U');

// Posiciones de la capa superior, en orden cíclico: esquina, arista entre esa esquina y la siguiente, ...
const CORNERS = [
  { pos: [1, 1, 1], sides: ['R', 'F'] }, { pos: [-1, 1, 1], sides: ['F', 'L'] },
  { pos: [-1, 1, -1], sides: ['L', 'B'] }, { pos: [1, 1, -1], sides: ['B', 'R'] },
];
const EDGES = [
  { pos: [0, 1, 1], side: 'F' }, { pos: [-1, 1, 0], side: 'L' }, { pos: [0, 1, -1], side: 'B' }, { pos: [1, 1, 0], side: 'R' },
];

/** Orientación de cada pieza de la última capa: esquinas 0/1/2, aristas 0/1 (0 = pegatina de arriba en su sitio). */
function orientations(colors) {
  const c = CORNERS.map(({ pos, sides }) =>
    colorAt(colors, pos, 'U') === 'U' ? 0 : colorAt(colors, pos, sides[0]) === 'U' ? 1 : 2);
  const e = EDGES.map(({ pos }) => (colorAt(colors, pos, 'U') === 'U' ? 0 : 1));
  return { c, e };
}

/** Categoría primaria de un OLL por el patrón de sus aristas superiores. */
export function edgeCategory(e) {
  const oriented = e.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (oriented.length === 4) return 'Cross';
  if (oriented.length === 0) return 'Dot';
  if (oriented.length === 2) return (oriented[1] - oriented[0]) % 2 === 0 ? 'Line' : 'Mini L';
  return 'Invalid';
}

function canonical({ c, e }) {
  const rots = [0, 1, 2, 3].map((k) => `${c.map((_, i) => c[(i + k) % 4]).join('')}-${e.map((_, i) => e[(i + k) % 4]).join('')}`);
  return { key: [...rots].sort()[0], classSize: new Set(rots).size };
}

const fail = (reason) => ({ ok: false, reason });

/**
 * Qué caso OLL resuelve el algoritmo: el patrón de orientación (salvo giros de la capa) del estado
 * que él deja orientado. Un algoritmo de última capa es el que conserva las dos primeras capas; el
 * caso que resuelve es, por definición, el patrón de su inverso. Eso no depende de cómo se sostenga el
 * cubo, así que vale también para algoritmos con rotaciones (x, y, z) o anchos que las compensan.
 */
export function ollCaseInfo(alg) {
  try {
    tokenize(alg);
  } catch (error) {
    return fail(error.message);
  }
  const state = stateAfter(invertNotation(alg));
  if (!f2lSolved(state)) return fail('altera las dos primeras capas');
  if (topFaceUniform(state)) return fail('no es un caso de OLL: deja la cara superior ya orientada');
  const o = orientations(state);
  return { ok: true, ...canonical(o), edges: edgeCategory(o.e) };
}

const AUF = ['', 'U', 'U2', "U'"];
const solvedState = solvedColors();

/** ¿Las aristas (o esquinas) de la capa superior están en su sitio? */
function layerSolved(colors, kind) {
  const spots = kind === 'edges' ? EDGES.map((e) => [e.pos, ['U', e.side]]) : CORNERS.map((c) => [c.pos, ['U', ...c.sides]]);
  return spots.every(([pos, faces]) => faces.every((f) => colorAt(colors, pos, f) === colorAt(solvedState, pos, f)));
}

/** Qué caso PLL resuelve el algoritmo, y de qué tipo es (solo aristas, solo esquinas, ambas). */
export function pllCaseInfo(alg) {
  try {
    tokenize(alg);
  } catch (error) {
    return fail(error.message);
  }
  const state = stateAfter(alg);
  if (!(f2lSolved(state) && topFaceUniform(state))) return fail('no deja las dos primeras capas y la orientación intactas');
  if (solvedUpToAuf(state)) return fail('no es un caso: no cambia nada salvo un AUF');

  // La clase del caso = todos los estados que se obtienen con un AUF antes y otro después.
  const states = new Set();
  for (const a of AUF) for (const b of AUF) states.add(stateAfter([a, alg, b].filter(Boolean).join(' ')).join(''));
  const fixedBy = (kind) => AUF.some((a) => layerSolved(stateAfter(a, state), kind));
  const cornersFixed = fixedBy('corners');
  const edgesFixed = fixedBy('edges');
  const permutes = cornersFixed ? 'Solo aristas' : edgesFixed ? 'Solo esquinas' : 'Aristas y esquinas';
  return { ok: true, key: [...states].sort()[0], classSize: states.size, states, permutes };
}