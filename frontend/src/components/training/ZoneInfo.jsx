export default function ZoneInfo({ zone }) {
  return (
    <details className="chrome panel zone-info">
      <summary>Qué evalúa y cómo hacer la prueba</summary>
      <div className="zone-info__body">
        <p>{zone.objective}</p>
        <h3>Pasos</h3>
        <ol>{zone.instructions.map((s) => <li key={s}>{s}</li>)}</ol>
        <h3>Estado inicial</h3>
        <p>{zone.initialState}</p>
        <h3>Cómo se mide</h3>
        <p>{zone.protocol}</p>
        <h3>Qué ayuda a detectar</h3>
        <ul>{zone.evaluates.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
    </details>
  );
}
