export default function ScrambleView({ scramble, onNew }) {
  return (
    <div className="scramble">
      <p className="scramble__text">{scramble}</p>
      <button type="button" className="btn" onClick={onNew}>
        Nueva mezcla
      </button>
    </div>
  );
}
