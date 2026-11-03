import { useMemo } from 'react';
import { scrambleFor } from '../../catalog/index.js';
import { STATUS_LABEL, statusOf } from '../../training/selection.js';
import LLDiagram from './LLDiagram.jsx';

const VERIFICATION_TEXT = { contrastado: 'Contrastado', una_fuente: '1 fuente', sin_verificar: 'Sin verificar' };

export default function CaseCard({ view, progress, selected, onSelect }) {
  const c = view.catalogCase;
  const scramble = useMemo(() => scrambleFor(c), [c]);
  const alias = c.aliases.find((a) => a.verified);
  const status = statusOf(progress, c.id);

  return (
    <button type="button" className="case-card" aria-pressed={selected} data-status={status} onClick={() => onSelect(c.id)}>
      <LLDiagram scramble={scramble} colored={c.set === 'PLL'} size={78} label={`Diagrama de ${c.name}`} />
      <span className="case-card__name">{c.set === 'OLL' ? `OLL ${c.number}` : `PLL ${c.short}`}</span>
      <span className="case-card__sub">{alias ? alias.name : c.shape ?? c.category}</span>
      <span className="case-card__tags">
        <span className="tag" data-kind="status">{STATUS_LABEL[status]}</span>
        <span className="tag" data-kind="verification" data-level={c.verification.level}>{VERIFICATION_TEXT[c.verification.level]}</span>
      </span>
    </button>
  );
}