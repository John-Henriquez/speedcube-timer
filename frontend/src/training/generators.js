import { applyAlgorithm, solvedState } from '../core/cube/cube.js';
import { solveCross } from '../core/cube/crossSolver.js';
import { generate3x3 } from '../core/scramble/3x3.js';
import { casesOf, getCase, scrambleFor } from '../catalog/index.js';
import { toFaceTurns } from '../core/cube/notation.js';
import { caseLabel } from './cases.js';

/** Colores en la orientación estándar (blanco arriba, verde al frente). */
export const COLOR_OF_FACE = { U: 'blanco', D: 'amarillo', F: 'verde', B: 'azul', R: 'rojo', L: 'naranja' };
export const faceOfColor = (color) => Object.keys(COLOR_OF_FACE).find((f) => COLOR_OF_FACE[f] === color);

const AUF = ['', 'U', "U'", 'U2'];
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const join = (...parts) => parts.filter(Boolean).join(' ');

/** Cross y Cross + primer par: una mezcla normal; la cruz se hace en la cara elegida. */
export function generateCross({ face = 'D', rng = Math.random } = {}) {
  return { zone: 'cross', scramble: generate3x3(20, rng), face, color: COLOR_OF_FACE[face] };
}

export function generateCrossPair({ face = 'D', rng = Math.random } = {}) {
  return { ...generateCross({ face, rng }), zone: 'cross-pair' };
}

/**
 * F2L con la cruz (abajo) resuelta y el resto aleatorio y alcanzable:
 * mezcla aleatoria + los movimientos que resuelven solo la cruz.
 */
export function generateF2L({ rng = Math.random } = {}) {
  const base = generate3x3(20, rng);
  const fix = solveCross(applyAlgorithm(solvedState(), base), 'D');
  return { zone: 'f2l', scramble: join(base, ...fix), face: 'D', color: COLOR_OF_FACE.D };
}

/**
 * Reto de OLL o PLL. `caseId` fija el caso; `pool` (lista de ids) restringe el sorteo; `algorithmId`
 * elige una variante del catálogo (por defecto, la recomendada) y `algorithm` una variante personal. La mezcla son solo giros de cara.
 */ 
function fromCase(zone, set, { caseId, pool, algorithmId, algorithm: custom, rng = Math.random } = {}) {
  const id = caseId ?? pick(pool?.length ? pool : casesOf(set).map((c) => c.id), rng);
  const found = getCase(id);
  if (!found || found.set !== set) throw new Error(`Caso desconocido: ${id}`);
  // `custom` ({ id, notation }) permite usar una variante personal ya validada contra este caso.
  const algorithm = custom ?? (algorithmId ? found.algorithms.find((a) => a.id === algorithmId) : found.recommended);
  if (!algorithm) throw new Error(`Algoritmo desconocido o sin verificar: ${algorithmId}`);
  // Estado del caso = inverso del algoritmo, y un AUF aleatorio después: el usuario debe alinear antes de ejecutar.
  const auf = pick(AUF, rng);
  return {
    zone,
    caseId: found.id,
    caseName: caseLabel(found),
    scramble: toFaceTurns(join(scrambleFor(found, algorithm), auf)),
    auf,
    alg: algorithm.notation,
  };
}

export const generateOll = (opts) => fromCase('oll', 'OLL', opts);
export const generatePll = (opts) => fromCase('pll', 'PLL', opts);
