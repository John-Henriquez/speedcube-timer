import { generate3x3 } from './3x3.js';

/** Registro de puzzles. Para añadir uno nuevo: crear su generador y registrarlo aquí. */
export const PUZZLES = {
  '3x3': { label: '3x3', generate: generate3x3 },
};

export function generateScramble(puzzle = '3x3') {
  const entry = PUZZLES[puzzle];
  if (!entry) throw new Error(`Puzzle no soportado: ${puzzle}`);
  return entry.generate();
}
