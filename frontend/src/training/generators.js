import { applyAlgorithm, invertAlgorithm, solvedState } from '../core/cube/cube.js';
import { solveCross } from '../core/cube/crossSolver.js';
import { generate3x3 } from '../core/scramble/3x3.js';
import { OLL_CASES, PLL_CASES } from './cases.js';

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

function fromCase(zone, cases, { caseId, rng = Math.random } = {}) {
  const found = caseId ? cases.find((c) => c.id === caseId) : pick(cases, rng);
  if (!found) throw new Error(`Caso desconocido: ${caseId}`);
  // Estado = inverso del algoritmo, y un AUF aleatorio después: el usuario debe alinear antes de ejecutar.
  const auf = pick(AUF, rng);
  return {
    zone,
    caseId: found.id,
    caseName: found.name,
    scramble: join(invertAlgorithm(found.alg), auf),
    auf,
    alg: found.alg,
  };
}

export const generateOll = (opts) => fromCase('oll', OLL_CASES, opts);
export const generatePll = (opts) => fromCase('pll', PLL_CASES, opts);
