const SEGMENTS = 20;

export default function GoalBar({ label, progress, className = '' }) {
  const { count, goal, percent, fill, reached } = progress;
  const on = count > 0 ? Math.max(1, Math.floor(fill * SEGMENTS)) : 0;
  return (
    <div className={`goal ${className}`} data-reached={reached}>
      <span className="goal__label">{label}</span>
      <div
        className="goal__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(count, goal)}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className="goal__seg" data-on={i < on} />
        ))}
      </div>
      <span className="goal__numbers">
        {count}/{goal} · {percent}%{reached ? ' ✓' : ''}
      </span>
    </div>
  );
}
