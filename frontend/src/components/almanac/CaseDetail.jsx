import { useMemo, useState } from 'react';
import { scrambleFor } from '../../catalog/index.js';
import { checkPersonalAlgorithm } from '../../catalog/personal.js';
import { formatStat } from '../../core/format.js';
import { usableAlgorithms } from '../../training/algorithms.js';
import { MODE } from '../../training/attempts.js';
import { STATUS_LABEL, STATUS_ORDER } from '../../training/selection.js';
import { summarizeAttempts } from '../../training/stats.js';
import CubeView from '../CubeView.jsx';
import LLDiagram from './LLDiagram.jsx';

const LEVEL_TEXT = {
  contrastado: 'Contrastado: al menos dos fuentes independientes resuelven este mismo patrón y el simulador lo confirma.',
  una_fuente: 'Una sola fuente válida: el simulador lo confirma, pero solo una fuente respalda este patrón.',
  sin_verificar: 'Sin verificar: ningún algoritmo superó la verificación.',
};

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Ficha de un caso: diagrama, datos verificados, algoritmos, estado de aprendizaje, variantes propias e intentos. */
export default function CaseDetail({ caseObj: c, userAlgs, preferredId, status, attempts, decimals, actions }) {
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState('');
  const scramble = useMemo(() => scrambleFor(c), [c]);
  const algorithms = usableAlgorithms(c, { [c.id]: userAlgs });
  const discarded = c.algorithms.filter((a) => a.status === 'invalido' || a.status === 'discrepante');
  const stats = summarizeAttempts(attempts.filter((a) => a.mode === MODE.EXECUTION));

  const submit = (e) => {
    e.preventDefault();
    const result = checkPersonalAlgorithm(c, draft, userAlgs);
    if (!result.ok) {
      setFeedback({ ok: false, text: result.reason });
      return;
    }
    actions.addAlgorithm(c.id, {
      id: `${c.id}@p${Date.now().toString(36)}`, notation: result.normalized, original: draft.trim(), createdAt: new Date().toISOString(), status: 'validado',
    });
    setFeedback({ ok: true, text: ['Guardada como variante personal: el simulador confirmó que resuelve este caso.', ...result.warnings].join(' ') });
    setDraft('');
  };

  const doCopy = async (notation) => {
    if (await copy(notation)) {
      setCopied(notation);
      setTimeout(() => setCopied(''), 1500);
    }
  };

  return (
    <article className="panel case-detail" aria-label={`Ficha de ${c.name}`}>
      <header className="case-detail__head">
        <LLDiagram scramble={scramble} colored={c.set === 'PLL'} size={132} label={`Diagrama de ${c.name}`} />
        <div>
          <h2>{c.name}</h2>
          <p className="case-detail__meta">
            {c.set === 'OLL' ? `Categoría: ${c.category} · Familia: ${c.shape}` : `Tipo: ${c.category}`}
          </p>
          {c.aliases.length > 0 && (
            <p className="case-detail__meta">
              Alias: {c.aliases.map((a) => (a.verified ? a.name : `${a.name} (sin contrastar)`)).join(', ')}
            </p>
          )}
          <p className="case-detail__meta">Probabilidad publicada: {c.probability}</p>
        </div>
      </header>

      <section>
        <h3>Verificación</h3>
        <p className="case-detail__text" data-level={c.verification.level}>{LEVEL_TEXT[c.verification.level]}</p>
        <p className="case-detail__text">Fuentes que coinciden: {c.verification.sources.join(', ') || 'ninguna'}.</p>
        {c.verification.issues.length > 0 && (
          <details>
            <summary>Discrepancias encontradas ({c.verification.issues.length})</summary>
            <ul>{c.verification.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </details>
        )}
      </section>

      <section>
        <h3>Estado de aprendizaje</h3>
        <div className="seg" role="group" aria-label="Estado de aprendizaje">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" className="seg__btn" aria-pressed={status === s} onClick={() => actions.setStatus(c.id, s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Algoritmos</h3>
        <ul className="alg-list">
          {algorithms.map((a) => (
            <li key={a.id} className="alg">
              <code className="alg__notation">{a.notation}</code>
              <span className="alg__tags">
                {a.recommended && <span className="tag" data-kind="recommended">Recomendado</span>}
                {a.origin === 'personal' ? (
                  <span className="tag">Personal · validada con el simulador</span>
                ) : (
                  <span className="tag" data-level={a.status}>{a.status === 'contrastado' ? 'Contrastado' : '1 fuente'}</span>
                )}
                {a.sources.length > 0 && <span className="alg__sources">{a.sources.join(', ')}</span>}
              </span>
              <span className="alg__actions">
                <button type="button" className="mini" onClick={() => doCopy(a.notation)}>{copied === a.notation ? 'Copiado' : 'Copiar'}</button>
                <button type="button" className="mini" aria-pressed={preferredId === a.id} onClick={() => actions.setPreferred(c.id, preferredId === a.id ? null : a.id)}>Preferido</button>
                <button type="button" className="mini" onClick={() => actions.practice(c, a)}>Practicar</button>
                {a.origin === 'personal' && (
                  <button type="button" className="mini" aria-label={`Eliminar ${a.notation}`} onClick={() => actions.removeAlgorithm(c.id, a.id)}>×</button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {discarded.length > 0 && (
          <details>
            <summary>Descartados por la verificación ({discarded.length})</summary>
            <ul>{discarded.map((a) => <li key={a.id}><code>{a.original}</code>: {a.reason}</li>)}</ul>
          </details>
        )}
      </section>

      <section>
        <h3>Añadir una variante propia</h3>
        <form className="alg-form" onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setFeedback(null); }}
            placeholder="Por ejemplo: R U R' U R U2 R'"
            aria-label="Notación del algoritmo"
            spellCheck="false"
          />
          <button type="submit" className="btn" disabled={!draft.trim()}>Comprobar y guardar</button>
        </form>
        {feedback && <p className="alg-form__feedback" data-ok={feedback.ok} role="status">{feedback.text}</p>}
        <p className="case-detail__text">Solo se guarda si el simulador comprueba que resuelve este caso. No cambia el nombre ni el patrón del caso.</p>
      </section>

      <section>
        <h3>Intentos de este caso</h3>
        {stats.attempts === 0 ? (
          <p className="case-detail__text">Aún sin intentos.</p>
        ) : (
          <p className="case-detail__text">
            {stats.attempts} intentos · mejor {formatStat(stats.best, decimals)} · mediana {formatStat(stats.median, decimals)}
            {!stats.sufficient && ' (datos insuficientes: menos de 5)'}
          </p>
        )}
        <div className="case-detail__cta">
          <button type="button" className="btn" onClick={() => actions.practice(c, null)}>Practicar este caso</button>
        </div>
      </section>

      <details>
        <summary>Ver el caso en el cubo</summary>
        <CubeView scramble={scramble} />
      </details>
    </article>
  );
}