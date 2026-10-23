import { useMemo } from 'react';
import { applyAlgorithm, solvedState } from '../core/cube/cube.js';
import { toFacelets } from '../core/cube/facelets.js';
import { FACE_COLORS, ISO_VIEWBOX, NET_VIEWBOX, isoPolygons, netCells } from '../core/cube/geometry.js';

const box = (v) => `${v.x} ${v.y} ${v.width} ${v.height}`;

/**
 * Dibuja el cubo resultante de aplicar `scramble` a un cubo resuelto (o el `state` dado):
 * vista isométrica y desarrollo plano con las seis caras.
 * Orientación estándar: blanco arriba, verde al frente.
 */
export default function CubeView({ scramble = '', state = null }) {
  const view = useMemo(() => {
    try {
      const grid = toFacelets(state ?? applyAlgorithm(solvedState(), scramble));
      return { iso: isoPolygons(grid), net: netCells(grid) };
    } catch {
      return null; // mezcla con un movimiento no reconocido: no se dibuja nada
    }
  }, [scramble, state]);

  if (!view) return null;

  return (
    <figure className="cube-view">
      <div className="cube-view__drawings">
        <svg className="cube-view__iso" viewBox={box(ISO_VIEWBOX)} role="img" aria-label="Vista isométrica del cubo mezclado">
          {view.iso.map((p, i) => (
            <polygon key={i} points={p.points.map((q) => q.join(',')).join(' ')} fill={FACE_COLORS[p.color]} />
          ))}
        </svg>
        <svg className="cube-view__net" viewBox={box(NET_VIEWBOX)} role="img" aria-label="Desarrollo plano con las seis caras">
          {view.net.map((c) => (
            <rect key={`${c.x}-${c.y}`} x={c.x + 0.04} y={c.y + 0.04} width="0.92" height="0.92" rx="0.1" fill={FACE_COLORS[c.color]} />
          ))}
        </svg>
      </div>
      <figcaption>Blanco arriba, verde al frente.</figcaption>
    </figure>
  );
}
