import { CORNERS, EDGES } from './cube.js';

/**
 * De piezas (esquinas/aristas) a pegatinas por cara, para poder dibujar el cubo.
 * Resultado: { U, R, F, D, L, B }, cada cara una matriz 3x3 [fila][columna] con la
 * letra de la cara a la que pertenece el color de cada pegatina ("U" = color de arriba).
 * Disposición de cada cara como en el desarrollo estándar: arriba con el frente abajo,
 * y las cuatro caras laterales vistas desde fuera con U arriba.
 */
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

const AXIS = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };

/** Posición 3D (-1, 0, 1 en cada eje) de una pieza a partir de su nombre ("URF" -> [1, 1, 1]). */
const coord = (name) => [...name].reduce((p, f) => p.map((v, i) => v + AXIS[f][i]), [0, 0, 0]);

/** [fila, columna] de una pegatina en su cara según su posición 3D. */
export const CELL = {
  U: ([x, , z]) => [z + 1, x + 1],
  D: ([x, , z]) => [1 - z, x + 1],
  F: ([x, y]) => [1 - y, x + 1],
  B: ([x, y]) => [1 - y, 1 - x],
  R: ([, y, z]) => [1 - y, 1 - z],
  L: ([, y, z]) => [1 - y, z + 1],
};

export function toFacelets(state) {
  const grid = Object.fromEntries(FACES.map((f) => [f, Array.from({ length: 3 }, () => Array(3).fill(f))]));
  const put = (position, face, color) => {
    const [r, c] = CELL[face](coord(position));
    grid[face][r][c] = color;
  };
  for (let i = 0; i < 8; i++) {
    const position = CORNERS[i];
    const piece = CORNERS[state.cp[i]];
    for (let n = 0; n < 3; n++) put(position, position[(n + state.co[i]) % 3], piece[n]);
  }
  for (let i = 0; i < 12; i++) {
    const position = EDGES[i];
    const piece = EDGES[state.ep[i]];
    for (let n = 0; n < 2; n++) put(position, position[(n + state.eo[i]) % 2], piece[n]);
  }
  return grid;
}
