export default function TimerDisplay({ tone, text, hint, onPointerDown }) {
  return (
    <div className="timer" data-tone={tone} onPointerDown={onPointerDown}>
      <div className="timer__time">{text}</div>
      <p className="timer__hint">{hint}</p>
    </div>
  );
}
