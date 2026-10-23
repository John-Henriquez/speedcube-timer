export default function NavTabs({ sections, active, onChange }) {
  return (
    <nav className="chrome nav" aria-label="Secciones">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="nav__tab"
          aria-current={active === s.id ? 'page' : undefined}
          onClick={() => onChange(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
