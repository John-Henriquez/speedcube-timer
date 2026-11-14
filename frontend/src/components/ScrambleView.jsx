export default function ScrambleView({ scramble, onNew, showCube = false, onToggleCube = null }) {
  return (
    <div className="scramble">
      <p className="scramble__text">{scramble}</p>
      <div className="chrome scramble__actions">
        <button type="button" className="btn" onClick={onNew}>
          Nueva
        </button>
      </div>
    </div>
  );
}
