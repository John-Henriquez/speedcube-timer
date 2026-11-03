import { useMemo, useState } from 'react';
import { OLL_CATEGORIES, PLL_CATEGORIES } from '../catalog/index.js';
import { casesForZone } from '../training/cases.js';
import { coverageStats } from '../training/coverage.js';
import { STATUS_LABEL, STATUS_ORDER, filterCases, statusOf } from '../training/selection.js';
import CaseCard from '../components/almanac/CaseCard.jsx';
import CaseDetail from '../components/almanac/CaseDetail.jsx';

const SHAPES = ['Dot', 'OCLL', 'T', 'P', 'Fish', 'Square', 'Lightning', 'Big Lightning', 'W', 'C', 'I', 'Small L', 'Knight Move', 'Awkward', 'Corners oriented'];

/** Almanaque CFOP: el catálogo completo de OLL y PLL, con sus algoritmos verificados y tu progreso. */
export default function AlmanacPage({ settings, almanac, attemptsApi, initialCaseId = null, onPractice }) {
  const [set, setSet] = useState(initialCaseId?.startsWith('pll') ? 'pll' : 'oll');
  const [category, setCategory] = useState('');
  const [shape, setShape] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialCaseId);

  const all = casesForZone(set);
  const categories = set === 'oll' ? OLL_CATEGORIES : PLL_CATEGORIES;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filterCases(all, { categories: category ? [category] : [], statuses: status ? [status] : [] }, almanac.progress)
      .filter((c) => !shape || c.catalogCase.shape === shape)
      .filter((c) => {
        if (!q) return true;
        const cc = c.catalogCase;
        return [cc.name, cc.short ?? '', String(cc.number ?? ''), ...cc.aliases.map((a) => a.name)].some((s) => s.toLowerCase().includes(q));
      });
  }, [all, category, shape, status, query, almanac.progress]);

  const coverage = coverageStats(all, attemptsApi.attempts, almanac.progress);
  const selected = selectedId ? all.find((c) => c.id === selectedId)?.catalogCase ?? null : null;
  const caseAttempts = selected ? attemptsApi.attempts.filter((a) => a.caseId === selected.id && a.zone === set) : [];

  const switchSet = (next) => {
    setSet(next);
    setCategory('');
    setShape('');
    setSelectedId(null);
  };

  const actions = {
    setStatus: almanac.setStatus,
    addAlgorithm: almanac.addUserAlgorithm,
    removeAlgorithm: almanac.removeUserAlgorithm,
    setPreferred: almanac.setPreferredAlgorithm,
    practice: (c, algorithm) => onPractice({ zoneId: c.set.toLowerCase(), caseId: c.id, algorithmId: algorithm?.id ?? null }),
  };

  return (
    <div className="page almanac">
      <header className="chrome almanac__head">
        <h1>Almanaque CFOP</h1>
        <div className="seg" role="group" aria-label="Conjunto">
          {[['oll', 'OLL · 57'], ['pll', 'PLL · 21']].map(([id, label]) => (
            <button key={id} type="button" className="seg__btn" aria-pressed={set === id} onClick={() => switchSet(id)}>{label}</button>
          ))}
        </div>
      </header>

      <section className="panel almanac__coverage" aria-label="Cobertura">
        <h2>Cobertura de {set.toUpperCase()}</h2>
        <dl className="coverage">
          {[
            ['En el catálogo', coverage.total],
            ['Verificados (contrastados)', coverage.verified],
            ['Con datos por validar', coverage.pendingValidation],
            ['Practicados', coverage.practiced],
            ['Sin intentos', coverage.unpracticed],
            ['Pendientes de aprender', coverage.pendingLearning],
          ].map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </section>

      <div className="chrome almanac__filters">
        <label>Buscar<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Número o nombre" /></label>
        <label>Categoría
          <select value={category} onChange={(e) => { setCategory(e.target.value); e.target.blur(); }}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {set === 'oll' && (
          <label>Familia
            <select value={shape} onChange={(e) => { setShape(e.target.value); e.target.blur(); }}>
              <option value="">Todas</option>
              {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label>Aprendizaje
          <select value={status} onChange={(e) => { setStatus(e.target.value); e.target.blur(); }}>
            <option value="">Todos</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <span className="almanac__count">{visible.length} de {all.length}</span>
      </div>

      <div className="almanac__layout">
        <div className="almanac__grid" role="list" aria-label="Casos">
          {visible.length === 0 && <p className="empty">Ningún caso cumple los filtros.</p>}
          {visible.map((v) => (
            <div role="listitem" key={v.id}>
              <CaseCard view={v} progress={almanac.progress} selected={v.id === selectedId} onSelect={setSelectedId} />
            </div>
          ))}
        </div>
        {selected ? (
          <CaseDetail
            key={selected.id}
            caseObj={selected}
            userAlgs={almanac.userAlgs[selected.id] ?? []}
            preferredId={almanac.preferred[selected.id] ?? null}
            status={statusOf(almanac.progress, selected.id)}
            attempts={caseAttempts}
            decimals={settings.decimals}
            actions={actions}
          />
        ) : (
          <aside className="panel almanac__hint"><p className="empty">Elige un caso para ver su ficha: diagrama, algoritmos verificados, tu estado de aprendizaje y tus intentos.</p></aside>
        )}
      </div>
    </div>
  );
}