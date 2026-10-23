import { formatSolve } from '../core/format.js';

export default function SessionList({ solves, decimals, onPenalty, onDelete, onClear, title = 'Sesión', clearLabel = 'Borrar sesión' }) {
  const rows = [...solves].reverse();

  const confirmClear = () => {
    if (window.confirm('¿Borrar todos los tiempos de esta lista? Esta acción no se puede deshacer.')) {
      onClear();
    }
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        {solves.length > 0 && (
          <button type="button" className="btn btn--quiet" onClick={confirmClear}>
            {clearLabel}
          </button>
        )}
      </div>

      {solves.length === 0 ? (
        <p className="empty">Aún no hay tiempos. Haz tu primera resolución con el timer.</p>
      ) : (
        <ol className="solves">
          {rows.map((solve, i) => (
            <li className="solve" key={solve.id}>
              <span className="solve__num">{solves.length - i}</span>
              <span className="solve__time" data-penalty={solve.penalty ?? ''}>
                {formatSolve(solve, decimals)}
              </span>
              <span className="solve__actions">
                <button
                  type="button"
                  className="mini"
                  aria-pressed={solve.penalty === '+2'}
                  onClick={() => onPenalty(solve.id, '+2')}
                >
                  +2
                </button>
                <button
                  type="button"
                  className="mini"
                  aria-pressed={solve.penalty === 'DNF'}
                  onClick={() => onPenalty(solve.id, 'DNF')}
                >
                  DNF
                </button>
                <button
                  type="button"
                  className="mini"
                  aria-label={`Eliminar tiempo ${solves.length - i}`}
                  onClick={() => onDelete(solve.id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
