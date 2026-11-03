import { useMemo, useState } from 'react';
import { formatTime } from '../../core/format.js';
import { MODE, VALIDATION } from '../../training/attempts.js';
import { attemptsOfCase, pageAverage, paginate, toggleDnf } from '../../training/postit.js';

const STATE_TEXT = {
  [VALIDATION.VALID]: 'Válido',
  [VALIDATION.UNVERIFIED]: 'Sin verificar',
  [VALIDATION.INVALID]: 'DNF',
};

/** Nota adhesiva con los últimos intentos del caso actual, de 5 en 5. Complementa las estadísticas, no las reemplaza. */
export default function PostIt({ attempts, zoneId, caseId, title, decimals, onSetValidation, onRemove }) {
  const [page, setPage] = useState(0);
  const list = useMemo(
    () => attemptsOfCase(attempts.filter((a) => a.mode === MODE.EXECUTION), zoneId, caseId),
    [attempts, zoneId, caseId],
  );
  const view = paginate(list, page);
  const avg = pageAverage(view.items);

  const remove = (a) => {
    if (window.confirm(`¿Eliminar el intento n.º ${a.number}? Esta acción no se puede deshacer.`)) onRemove(a.id);
  };

  return (
    <aside className="postit" aria-label="Últimos intentos">
      <h3 className="postit__title">Últimos intentos</h3>
      <p className="postit__scope">{title}</p>

      {view.items.length === 0 ? (
        <p className="postit__empty">Sin intentos con tiempo todavía.</p>
      ) : (
        <ol className="postit__list">
          {view.items.map((a) => (
            <li key={a.id} className="postit__item" data-state={a.validation}>
              <span className="postit__num">n.º {a.number}</span>
              <span className="postit__time">{formatTime(a.timeMs, decimals)}</span>
              <span className="postit__state">{STATE_TEXT[a.validation]}</span>
              <span className="postit__when">{new Date(a.date).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span className="postit__actions">
                <button type="button" className="mini" onClick={() => onSetValidation(a.id, toggleDnf(a))}>
                  {a.validation === VALIDATION.INVALID ? 'Restaurar' : 'DNF'}
                </button>
                <button type="button" className="mini" aria-label={`Borrar el intento n.º ${a.number}`} onClick={() => remove(a)}>Borrar</button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="postit__avg">
        Promedio de esta página: <strong>{avg.average == null ? '—' : formatTime(avg.average, decimals)}</strong>
        {view.items.length > 0 && <span> ({avg.used} válidos de {view.items.length})</span>}
      </p>
      <p className="postit__note">Indicador local de estos intentos; no es un ao5 oficial.</p>

      <div className="postit__pager">
        <button type="button" className="mini" disabled={view.page === 0} onClick={() => setPage(view.page - 1)} aria-label="Página anterior">‹</button>
        <span>{view.page + 1} / {view.pages}</span>
        <button type="button" className="mini" disabled={view.page >= view.pages - 1} onClick={() => setPage(view.page + 1)} aria-label="Página siguiente">›</button>
      </div>
    </aside>
  );
}