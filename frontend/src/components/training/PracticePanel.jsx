import { useCallback, useMemo, useRef, useState } from 'react';
import { getDisplay } from '../../core/display.js';
import { formatTime } from '../../core/format.js';
import { useTimer } from '../../hooks/useTimer.js';
import { useTimerControls } from '../../hooks/useTimerControls.js';
import { CAPTURE, MODE, VALIDATION } from '../../training/attempts.js';
import { OLL_CASES, PLL_CASES } from '../../training/cases.js';
import { COLOR_OF_FACE, faceOfColor } from '../../training/generators.js';
import CubeView from '../CubeView.jsx';
import TimerDisplay from '../TimerDisplay.jsx';

const CASES = { oll: OLL_CASES, pll: PLL_CASES };
const COLORS = Object.values(COLOR_OF_FACE);

const VALIDATION_LABEL = {
  [VALIDATION.UNVERIFIED]: 'Sin verificar',
  [VALIDATION.VALID]: 'Confirmado por ti ✓',
  [VALIDATION.INVALID]: 'Marcado como incorrecto',
};

/** Práctica de una zona: genera el reto, mide (o pregunta) y registra el intento. */
export default function PracticePanel({ zone, attemptsApi, busyRef, decimals }) {
  const { add, setValidation } = attemptsApi;
  const cases = CASES[zone.id] ?? null;
  const [mode, setMode] = useState(MODE.EXECUTION);
  const [caseId, setCaseId] = useState('');
  const [color, setColor] = useState('amarillo');
  const [seed, setSeed] = useState(0);
  const [last, setLast] = useState(null);

  const knowledge = Boolean(cases) && mode === MODE.KNOWLEDGE;
  const face = faceOfColor(color);

  const challenge = useMemo(() => {
    if (cases) return zone.generate({ caseId: caseId || undefined });
    if (zone.id === 'f2l') return zone.generate();
    return zone.generate({ face });
  }, [zone, cases, caseId, face, seed]); // `seed` fuerza una mezcla nueva

  const challengeRef = useRef(challenge);
  challengeRef.current = challenge;
  const next = useCallback(() => setSeed((s) => s + 1), []);

  const record = useCallback(
    (data) => {
      const c = challengeRef.current;
      const attempt = add({
        zone: zone.id,
        caseId: c.caseId ?? null,
        scramble: c.scramble,
        notes: !cases && c.color ? `Cruz: ${c.color}` : '',
        capture: CAPTURE.MANUAL,
        ...data,
      });
      setLast({
        id: attempt.id, mode: attempt.mode, timeMs: attempt.timeMs, validation: attempt.validation,
        caseName: c.caseName ?? null, alg: c.alg ?? null,
      });
      next();
    },
    [add, zone.id, cases, next],
  );

  const timer = useTimer({
    inspection: false,
    onFinish: (r) => record({ mode: MODE.EXECUTION, timeMs: Math.floor(r.time) }),
  });
  const { onAreaPointerDown } = useTimerControls({ timer, enabled: !knowledge, busyRef });
  const display = getDisplay(timer, decimals);

  const confirm = (validation) => {
    setValidation(last.id, validation);
    setLast((l) => ({ ...l, validation }));
  };
  const blurAfter = (fn) => (e) => {
    e.target.blur(); // para que Espacio siga iniciando el timer y no abra el selector
    fn(e.target.value);
  };

  return (
    <section className="practice">
      <div className="chrome practice__controls">
        {cases && (
          <>
            <label>
              Caso
              <select value={caseId} onChange={blurAfter((v) => { setCaseId(v); setLast(null); })}>
                <option value="">Aleatorio</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.family}</option>)}
              </select>
            </label>
            <div className="seg" role="group" aria-label="Modalidad">
              {[[MODE.EXECUTION, 'Ejecución'], [MODE.KNOWLEDGE, 'Conocimiento']].map(([m, label]) => (
                <button key={m} type="button" className="seg__btn" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {label}
                </button>
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

      <div className="practice__challenge">
        <p className="scramble__text">{challenge.scramble}</p>
        <p className="practice__meta">
          {cases && !knowledge && `Caso: ${challenge.caseName}.`}
          {cases && knowledge && '¿Reconoces el caso y sabes resolverlo? El nombre se muestra al responder.'}
          {!cases && zone.id === 'f2l' && 'Queda la cruz amarilla resuelta abajo; el resto, mezclado.'}
          {!cases && zone.id !== 'f2l' && `Cruz ${color}, abajo si usas la cara ${face}.`}
        </p>
        <CubeView scramble={challenge.scramble} />
      </div>

      {knowledge ? (
        <div className="practice__answer">
          <button type="button" className="btn practice__yes" onClick={() => record({ mode: MODE.KNOWLEDGE, timeMs: null, validation: VALIDATION.VALID })}>
            Lo sé resolver
          </button>
          <button type="button" className="btn practice__no" onClick={() => record({ mode: MODE.KNOWLEDGE, timeMs: null, validation: VALIDATION.INVALID })}>
            No lo sé
          </button>
        </div>
      ) : (
        <TimerDisplay tone={display.tone} text={display.text} hint={display.hint} onPointerDown={onAreaPointerDown} />
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
    </section>
  );
}
