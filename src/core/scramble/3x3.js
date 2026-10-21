const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
const SUFFIXES = ['', "'", '2'];

/**
 * Mezcla de 3x3 por movimientos aleatorios.
 * Reglas: nunca la misma cara dos veces seguidas y nunca el patrón
 * cara opuesta + cara opuesta + misma cara inicial (p. ej. R L R).
 */
export function generate3x3(length = 20, rng = Math.random) {
  const moves = [];
  let last = null;
  let beforeLast = null;
  while (moves.length < length) {
    const face = FACES[Math.floor(rng() * FACES.length)];
    if (face === last) continue;
    if (last && beforeLast && AXIS[face] === AXIS[last] && AXIS[face] === AXIS[beforeLast]) continue;
    moves.push(face + SUFFIXES[Math.floor(rng() * SUFFIXES.length)]);
    beforeLast = last;
    last = face;
  }
  return moves.join(' ');
}
