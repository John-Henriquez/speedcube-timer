export default function GoalBar({ label, progress, className = '' }) {
  const { count, goal, percent, fill, reached } = progress;
  return (
    <div className={`goal ${className}`} data-reached={reached}>
      <div className="goal__head">
        <span>{label}</span>
        <span className="goal__numbers">
          {count} / {goal} · {percent}%{reached ? ' ✓' : ''}
        </span>
      </div>
      <div
        className="goal__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(count, goal)}
      >
        <div className="goal__fill" style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}
