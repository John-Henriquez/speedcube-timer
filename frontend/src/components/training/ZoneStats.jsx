import { formatStat } from '../../core/format.js';
import { OLL_CASES, PLL_CASES } from '../../training/cases.js';
import { caseRows, zoneSummary } from '../../training/zoneStats.js';

const CASES = { oll: OLL_CASES, pll: PLL_CASES };
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function ZoneStats({ zone, attempts, decimals }) {
  const { execution: s, knowledge } = zoneSummary(attempts, zone.id);
  const cases = CASES[zone.id];
  const rows = cases ? caseRows(attempts, zone.id, cases) : [];
  const cards = [
    ['Intentos', s.attempts],
    ['Mejor', formatStat(s.best, decimals)],
    ['Mediana', formatStat(s.median, decimals)],
    ['Dispersión', pct(s.spread)],
    ['Errores', pct(s.errorRate)],
    ['Sin verificar', s.unverified],
  ];

  return (
    <section className="chrome panel zone-stats">
      <h2>Estadísticas de {zone.name}</h2>
      {s.attempts === 0 && knowledge.total === 0 ? (
        <p className="empty">Aún no hay intentos en esta zona.</p>
      ) : (
        <>
          <div className="stat-cards">
            {cards.map(([label, value]) => (
              <div className="stat-card" key={label}>
                <span className="stat-card__label">{label}</span>
                <span className="stat-card__value">{value}</span>
              </div>
            ))}
          </div>
          {!s.sufficient && (
            <p className="zone-stats__note">
              Datos insuficientes: hacen falta al menos 5 intentos con tiempo para sacar conclusiones. Los valores son orientativos.
            </p>
          )}
          {cases && knowledge.total > 0 && (
            <p className="zone-stats__note">Conocimiento: dijiste saber {knowledge.known} de {knowledge.total} pruebas.</p>
          )}
        </>
      )}

      {cases && (
        <div className="case-table-wrap">
          <table className="case-table">
            <thead>
              <tr><th>Caso</th><th>Intentos</th><th>Mejor</th><th>Mediana</th><th>Errores</th><th>Conocimiento</th></tr>
            </thead>
            <tbody>
              {rows.map(({ case: c, stats, knowledge: k }) => (
                <tr key={c.id} data-practiced={stats.attempts > 0 || k.total > 0}>
                  <td>{c.name} <span className="case-table__family">{c.family}</span></td>
                  <td>{stats.attempts}{stats.attempts > 0 && !stats.sufficient ? '*' : ''}</td>
                  <td>{formatStat(stats.best, decimals)}</td>
                  <td>{formatStat(stats.median, decimals)}</td>
                  <td>{pct(stats.errorRate)}</td>
                  <td>{k.total ? `${k.known}/${k.total}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="zone-stats__note">* Menos de 5 intentos con tiempo: dato orientativo. Los tiempos son medidos con el timer; la validez, confirmada por ti (no se verifica automáticamente).</p>
        </div>
      )}
    </section>
  );
}
