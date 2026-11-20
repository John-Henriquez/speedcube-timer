import { useAuth } from '../../auth/AuthContext.jsx';
import { describeSync } from '../../auth/syncText.js';

/** Indicador discreto del pie: dice en todo momento dónde viven los datos. */
export default function SyncBadge({ onClick }) {
  const auth = useAuth();
  const info = describeSync(auth);
  const who = auth.status === 'account' ? `${auth.user.displayName || auth.user.username} · ` : '';
  return (
    <button type="button" className={`acct-badge acct-status--${info.tone}`} onClick={onClick} title={info.detail}>
      <span className="acct-dot" aria-hidden="true" />
      {who}{info.label}
    </button>
  );
}