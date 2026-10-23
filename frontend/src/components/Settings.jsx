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
      <label className="goal-input">
        Meta diaria
        <input
          type="number"
          min="1"
          max="999"
          defaultValue={settings.dailyGoal}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value));
            if (n >= 1 && n <= 999) onChange({ dailyGoal: n });
          }}
        />
      </label>
      <button
        type="button"
        className="chip"
        aria-pressed={settings.showCube}
        onClick={() => onChange({ showCube: !settings.showCube })}
      >
        Mostrar cubo
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
