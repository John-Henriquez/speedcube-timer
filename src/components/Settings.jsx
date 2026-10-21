export default function Settings({ settings, onChange }) {
  return (
    <div className="settings">
      <button
        type="button"
        className="chip"
        aria-pressed={settings.inspection}
        onClick={() => onChange({ inspection: !settings.inspection })}
      >
        Inspección de 15 s
      </button>
      <div className="seg" role="group" aria-label="Decimales">
        {[2, 3].map((d) => (
          <button
            key={d}
            type="button"
            className="seg__btn"
            aria-pressed={settings.decimals === d}
            onClick={() => onChange({ decimals: d })}
          >
            {d} decimales
          </button>
        ))}
      </div>
    </div>
  );
}
