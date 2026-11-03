import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCase } from '../../catalog/index.js';
import { getDisplay } from '../../core/display.js';
import { formatTime } from '../../core/format.js';
import { useTimer } from '../../hooks/useTimer.js';
import { useTimerControls } from '../../hooks/useTimerControls.js';
import { chooseAlgorithm, usableAlgorithms } from '../../training/algorithms.js';
import { CAPTURE, MODE, VALIDATION } from '../../training/attempts.js';
import { casesForZone } from '../../training/cases.js';
import { COLOR_OF_FACE, faceOfColor } from '../../training/generators.js';
import { STATUS_LABEL, STATUS_ORDER, filterCases, nextInRound, randomFrom } from '../../training/selection.js';
import CubeView from '../CubeView.jsx';
import TimerDisplay from '../TimerDisplay.jsx';
import PostIt from './PostIt.jsx';

const COLORS = Object.values(COLOR_OF_FACE);
const VALIDATION_LABEL = {
  [VALIDATION.UNVERIFIED]: 'Sin verificar',
  [VALIDATION.VALID]: 'Confirmado por ti ✓',
  [VALIDATION.INVALID]: 'Marcado como incorrecto',
};

/** Práctica de una zona: elige el reto (con filtros y modo cobertura), mide o pregunta y registra el intento. */
export default function PracticePanel({ zone, attemptsApi, almanac, busyRef, decimals, target, onOpenCase }) {
  const { add, setValidation, remove, attempts } = attemptsApi;
  const cases = casesForZone(zone.id);
  const [mode, setMode] = useState(MODE.EXECUTION);
  const [caseId, setCaseId] = useState(target?.caseId ?? '');
  const [algChoice, setAlgChoice] = useState(target?.algorithmId ?? '');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [coverage, setCoverage] = useState(false);
  const [color, setColor] = useState('amarillo');
  const [last, setLast] = useState(null);

  const knowledge = Boolean(cases) && mode === MODE.KNOWLEDGE;
  const face = faceOfColor(color);

  // Casos entre los que se sortea: uno fijo, o los que cumplen los filtros.
  const poolIds = useMemo(() => {
    if (!cases) return [];
    if (caseId) return [caseId];
    return filterCases(cases, { categories: category ? [category] : [], statuses: statusFilter ? [statusFilter] : [] }, almanac.progress).map((c) => c.id);
  }, [cases, caseId, category, statusFilter, almanac.progress]);
  const poolKey = poolIds.join(',');

  const roundRef = useRef([]);
  const lastIdRef = useRef(null);
  const draw = useCallback(() => {
    if (coverage) {
      const n = nextInRound(roundRef.current, poolIds, lastIdRef.current);
      roundRef.current = n.round;
      lastIdRef.current = n.caseId;
      return n.caseId;
    }
    const id = randomFrom(poolIds);
    lastIdRef.current = id;
    return id;
  }, [coverage, poolIds]);

  const [pick, setPick] = useState(() => ({ id: cases ? draw() : null, n: 0 }));
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    roundRef.current = []; // cambió el grupo o el modo: empieza una ronda nueva
    const id = cases ? draw() : null;
    setPick((p) => ({ id, n: p.n + 1 }));
  }, [poolKey, coverage]); 
  const next = useCallback(() => {
    const id = cases ? draw() : null;
    setPick((p) => ({ id, n: p.n + 1 }));
  }, [cases, draw]);
  const challengeCaseId = cases ? pick.id ?? poolIds[0] ?? null : null;
  const challenge = useMemo(() => {
    if (cases) {
      if (!challengeCaseId) return null;
      const alg = chooseAlgorithm(getCase(challengeCaseId), { chosenId: caseId ? algChoice : '', userAlgs: almanac.userAlgs, preferred: almanac.preferred });
      return zone.generate({ caseId: challengeCaseId, algorithm: { id: alg.id, notation: alg.notation } });
    }
    if (zone.id === 'f2l') return zone.generate();
    return zone.generate({ face });
  }, [zone, cases, challengeCaseId, pick.n, algChoice, caseId, almanac.userAlgs, almanac.preferred, face]); 

  const challengeRef = useRef(challenge);
  challengeRef.current = challenge;

  const record = useCallback(
    (data) => {
      const c = challengeRef.current;
      if (!c) return;
      const attempt = add({
        zone: zone.id,
        caseId: c.caseId ?? null,
        scramble: c.scramble,
        algorithm: c.alg ? { id: c.algorithmId, notation: c.alg } : null,
        notes: !cases && c.color ? `Cruz: ${c.color}` : '',
        capture: CAPTURE.MANUAL,
        ...data,
      });
      setLast({
        id: attempt.id, mode: attempt.mode, timeMs: attempt.timeMs, validation: attempt.validation,
        caseId: c.caseId ?? null, caseName: c.caseName ?? null, alg: c.alg ?? null,
      });
      next();
    },
    [add, zone.id, cases, next],
  );

  const timer = useTimer({ inspection: false, onFinish: (r) => record({ mode: MODE.EXECUTION, timeMs: Math.floor(r.time) }) });
  const { onAreaPointerDown } = useTimerControls({ timer, enabled: !knowledge && Boolean(challenge), busyRef });
  const display = getDisplay(timer, decimals);

  const confirm = (validation) => {
    setValidation(last.id, validation);
    setLast((l) => ({ ...l, validation }));
  };
  const blurAfter = (fn) => (e) => {
    e.target.blur(); // para que Espacio siga iniciando el timer y no abra el selector
    fn(e.target.value);
  };

  const algorithms = caseId ? usableAlgorithms(getCase(caseId), { [caseId]: almanac.userAlgs[caseId] ?? [] }) : [];
  const scopeCaseId = cases ? (caseId || last?.caseId || null) : null;
  const scopeTitle = cases
    ? scopeCaseId ? getCase(scopeCaseId).name : 'Practica un caso para ver sus intentos'
    : zone.name;

  return (
    <section className="practice">
      <div className="chrome practice__controls">
        {cases && (
          <>
            <label>
              Caso
              <select value={caseId} onChange={blurAfter((v) => { setCaseId(v); setAlgChoice(''); setLast(null); })}>
                <option value="">Todos (según filtros)</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.family}</option>)}
              </select>
            </label>
            <label>
              Categoría
              <select value={category} disabled={Boolean(caseId)} onChange={blurAfter(setCategory)}>
                <option value="">Todas</option>
                {[...new Set(cases.map((c) => c.family))].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label>
              Aprendizaje
              <select value={statusFilter} disabled={Boolean(caseId)} onChange={blurAfter(setStatusFilter)}>
                <option value="">Todos</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            {caseId && algorithms.length > 1 && (
              <label>
                Algoritmo
                <select value={algChoice} onChange={blurAfter(setAlgChoice)}>
                  <option value="">Por defecto</option>
                  {algorithms.map((a) => <option key={a.id} value={a.id}>{a.recommended ? 'Recomendado: ' : a.origin === 'personal' ? 'Personal: ' : ''}{a.notation}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="chip" aria-pressed={coverage} disabled={Boolean(caseId)} onClick={() => setCoverage((v) => !v)} title="Recorre todos los casos del grupo antes de repetir ninguno">
              Cobertura
            </button>
            <div className="seg" role="group" aria-label="Modalidad">
              {[[MODE.EXECUTION, 'Ejecución'], [MODE.KNOWLEDGE, 'Conocimiento']].map(([m, label]) => (
                <button key={m} type="button" className="seg__btn" aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>
              ))}
            </div>
          </>
        )}
        {!cases && zone.id !== 'f2l' && (
          <label>
            Color de la cruz
            <select value={color} onChange={blurAfter(setColor)}>
              {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn" onClick={next}>Nueva mezcla</button>
      </div>
      {cases && coverage && !caseId && poolIds.length > 0 && (
        <p className="chrome practice__round">Cobertura: quedan {roundRef.current.length} de {poolIds.length} casos en esta ronda.</p>
      )}


      <div className="practice__grid">
        <div className="practice__main">
          {!challenge ? (
            <p className="panel empty">Ningún caso cumple los filtros elegidos. Cambia la categoría o el estado de aprendizaje.</p>
          ) : (
            <>
              <div className="practice__challenge">
                <p className="scramble__text">{challenge.scramble}</p>
                <p className="practice__meta">
                  {cases && !knowledge && <>Caso: {challenge.caseName}. <button type="button" className="btn btn--quiet" onClick={() => onOpenCase(challenge.caseId)}>Ver ficha</button></>}
                  {cases && knowledge && '¿Reconoces el caso y sabes resolverlo? El nombre se muestra al responder.'}
                  {!cases && zone.id === 'f2l' && 'Queda la cruz amarilla resuelta abajo; el resto, mezclado.'}
                  {!cases && zone.id !== 'f2l' && `Cruz ${color}, abajo si usas la cara ${face}.`}
                </p>
                <CubeView scramble={challenge.scramble} />
              </div>

              {knowledge ? (
                <div className="practice__answer">
                  <button type="button" className="btn practice__yes" onClick={() => record({ mode: MODE.KNOWLEDGE, timeMs: null, validation: VALIDATION.VALID })}>Lo sé resolver</button>
                  <button type="button" className="btn practice__no" onClick={() => record({ mode: MODE.KNOWLEDGE, timeMs: null, validation: VALIDATION.INVALID })}>No lo sé</button>
                </div>
              ) : (
                <TimerDisplay tone={display.tone} text={display.text} hint={display.hint} onPointerDown={onAreaPointerDown} />
              )}
            </>
          )}

          {last && (
            <div className="chrome panel practice__last" role="status">
              <strong>Último intento</strong>
              {last.caseName && <span> · {last.caseName}</span>}
              <span>
                {' · '}
                {last.mode === MODE.EXECUTION ? `${formatTime(last.timeMs, decimals)} (medido con el timer)` : 'prueba de conocimiento'}
                {' · '}
                {VALIDATION_LABEL[last.validation]}
              </span>
              {last.mode === MODE.EXECUTION && (
                <span className="practice__confirm">
                  <button type="button" className="mini" aria-pressed={last.validation === VALIDATION.VALID} onClick={() => confirm(VALIDATION.VALID)}>Salió bien</button>
                  <button type="button" className="mini" aria-pressed={last.validation === VALIDATION.INVALID} onClick={() => confirm(VALIDATION.INVALID)}>No salió bien</button>
                </span>
              )}
              {last.alg && (
                <details>
                  <summary>Ver algoritmo</summary>
                  <code>{last.alg}</code>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="chrome">
          <PostIt
            attempts={attempts}
            zoneId={zone.id}
            caseId={scopeCaseId}
            title={scopeTitle}
            decimals={decimals}
            onSetValidation={setValidation}
            onRemove={remove}
          />
        </div>
      </div>
    </section>
  );
}
