import { useMemo } from 'react';
import { applyAlgorithm, solvedState } from '../../core/cube/cube.js';
import { toFacelets } from '../../core/cube/facelets.js';
import { FACE_COLORS } from '../../core/cube/geometry.js';

/**
 * Diagrama de última capa visto desde arriba (frente abajo): la cara superior y, alrededor, la fila de
 * pegatinas laterales. En OLL se resalta qué pegatinas tienen el color de arriba (lo que se reconoce);
 * en PLL se pintan los colores reales, que muestran la permutación.
 */
export default function LLDiagram({ scramble, colored = false, size = 84, label }) {
  const shapes = useMemo(() => {
    const g = toFacelets(applyAlgorithm(solvedState(), scramble));
    const out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ x: c + 1.04, y: r + 1.04, w: 0.92, h: 0.92, color: g.U[r][c] });
    // Cada lado se lee como se ve desde arriba: atrás (B) de izquierda a derecha, derecha (R) de atrás a delante, etc.
    [2, 1, 0].forEach((c, i) => out.push({ x: i + 1.04, y: 0.62, w: 0.92, h: 0.3, color: g.B[0][c] }));
    [0, 1, 2].forEach((c, i) => out.push({ x: i + 1.04, y: 4.08, w: 0.92, h: 0.3, color: g.F[0][c] }));
    [0, 1, 2].forEach((c, i) => out.push({ x: 0.62, y: i + 1.04, w: 0.3, h: 0.92, color: g.L[0][c] }));
    [2, 1, 0].forEach((c, i) => out.push({ x: 4.08, y: i + 1.04, w: 0.3, h: 0.92, color: g.R[0][c] }));
    return out;
  }, [scramble]);

  return (
    <svg className="ll-diagram" viewBox="0.4 0.4 4.2 4.2" width={size} height={size} role="img" aria-label={label}>
      {shapes.map((s, i) => (
        <rect
          key={i}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          style={{ fill: colored ? FACE_COLORS[s.color] : s.color === 'U' ? 'var(--accent)' : 'var(--surface-2)' }}
        />
      ))}
    </svg>
  );
}