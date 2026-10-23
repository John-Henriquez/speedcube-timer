export default function ZoneNav({ zones, active, counts, onChange }) {
  return (
    <nav className="chrome zone-nav" aria-label="Zonas de entrenamiento">
      {zones.map((z, i) => (
        <button
          key={z.id}
          type="button"
          className="zone-nav__item"
          aria-current={active === z.id ? 'true' : undefined}
          onClick={() => onChange(z.id)}
        >
          <span className="zone-nav__index">{i + 1}</span>
          <span className="zone-nav__name">{z.name}</span>
          <span className="zone-nav__count" title="Intentos registrados">{counts[z.id] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}
