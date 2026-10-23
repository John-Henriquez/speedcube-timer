import { useMemo, useState } from 'react';
import { countByZone } from '../training/zoneStats.js';
import { ZONES, getZone } from '../training/zones/index.js';
import PracticePanel from '../components/training/PracticePanel.jsx';
import ZoneInfo from '../components/training/ZoneInfo.jsx';
import ZoneNav from '../components/training/ZoneNav.jsx';
import ZoneStats from '../components/training/ZoneStats.jsx';

/** Zona de entrenamiento: cinco pruebas, cada una con su práctica y sus propias estadísticas. */
export default function TrainingPage({ settings, attemptsApi, busyRef }) {
  const [zoneId, setZoneId] = useState('oll');
  const zone = getZone(zoneId);
  const counts = useMemo(() => countByZone(attemptsApi.attempts), [attemptsApi.attempts]);

  return (
    <div className="page training">
      <header className="chrome training__banner">
        <p className="training__kicker">Zona de entrenamiento</p>
        <h1>{zone.name}</h1>
        <p>{zone.objective}</p>
      </header>

      <div className="training__layout">
        <ZoneNav zones={ZONES} active={zoneId} counts={counts} onChange={setZoneId} />
        <div className="training__main">
          <ZoneInfo zone={zone} />
          <PracticePanel key={zone.id} zone={zone} attemptsApi={attemptsApi} busyRef={busyRef} decimals={settings.decimals} />
          <ZoneStats zone={zone} attempts={attemptsApi.attempts} decimals={settings.decimals} />
        </div>
      </div>
    </div>
  );
}
