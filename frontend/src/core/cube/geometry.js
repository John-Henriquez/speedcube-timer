import { FACES } from './facelets.js';

/** Colores de los stickers (orientación estándar: blanco arriba, verde al frente). */
export const FACE_COLORS = { U: '#f4f6f9', D: '#ffd23f', F: '#33c25e', B: '#3d7dff', R: '#ec4b42', L: '#ff8c24' };
export const FACE_NAMES = { U: 'blanco', D: 'amarillo', F: 'verde', B: 'azul', R: 'rojo', L: 'naranja' };

// ---------- Desarrollo plano (las 6 caras) ----------
const NET_ORIGIN = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] }; // [columna, fila]
export const NET_VIEWBOX = { x: 0, y: 0, width: 12, height: 9 };

/** Celdas 1x1 del desarrollo plano: { face, x, y, color }. */
export function netCells(grid) {
  return FACES.flatMap((face) =>
    grid[face].flatMap((row, r) =>
      row.map((color, c) => ({ face, x: NET_ORIGIN[face][0] + c, y: NET_ORIGIN[face][1] + r, color })),
    ),
  );
}

// ---------- Vista isométrica (se ven U, F y R) ----------
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
export const ISO_VIEWBOX = { x: -2.7, y: -3.1, width: 5.4, height: 6.2 };

const project = ([x, y, z]) => [(x - z) * COS30, (x + z) * SIN30 - y];

// Centro de la pegatina (fila, columna) en 3D y los dos ejes que recorre dentro de su cara.
const ISO_FACES = {
  U: { center: (r, c) => [c - 1, 1.5, r - 1], axes: [0, 2] },
  F: { center: (r, c) => [c - 1, 1 - r, 1.5], axes: [0, 1] },
  R: { center: (r, c) => [1.5, 1 - r, 1 - c], axes: [1, 2] },
};

/** Polígonos de las pegatinas visibles: { face, points: [[x, y] x4], color }. `inset` deja un borde entre pegatinas. */
export function isoPolygons(grid, inset = 0.92) {
  const out = [];
  for (const face of ['U', 'F', 'R']) {
    const { center, axes } = ISO_FACES[face];
    grid[face].forEach((row, r) =>
      row.forEach((color, c) => {
        const mid = center(r, c);
        const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
          const p = [...mid];
          p[axes[0]] += (a * inset) / 2;
          p[axes[1]] += (b * inset) / 2;
          return project(p);
        });
        out.push({ face, points, color });
      }),
    );
  }
  return out;
}

