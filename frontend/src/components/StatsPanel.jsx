import { formatStat } from '../core/format.js';

export default function StatsPanel({ stats, decimals, title = 'Estadísticas' }) {
  const rows = [
    ['Tiempos', stats.count],
    ['Mejor', formatStat(stats.best, decimals)],
    ['Media', formatStat(stats.mean, decimals)],
    ['ao5', formatStat(stats.ao5, decimals)],
    ['ao12', formatStat(stats.ao12, decimals)],
    ['Mejor ao5', formatStat(stats.bestAo5, decimals)],
    ['Mejor ao12', formatStat(stats.bestAo12, decimals)],
  ];

  return (
    <section className="panel">
      <h2>{title}</h2>
      <dl className="stats">
        {rows.map(([label, value]) => (
          <div className="stats__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
