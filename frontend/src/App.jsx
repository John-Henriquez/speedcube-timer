import { useEffect, useRef, useState } from 'react';
import { useAlmanac } from './hooks/useAlmanac.js';
import { useAttempts } from './hooks/useAttempts.js';
import { useSettings } from './hooks/useSettings.js';
import { useSolves } from './hooks/useSolves.js';
import { useSync } from './hooks/useSync.js';
import NavTabs from './components/NavTabs.jsx';
import SyncPanel from './components/SyncPanel.jsx';
import AlmanacPage from './pages/AlmanacPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import TimerPage from './pages/TimerPage.jsx';
import TrainingPage from './pages/TrainingPage.jsx';

const SECTIONS = [
  { id: 'timer', label: 'Timer' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'almanac', label: 'Almanaque' },
  { id: 'training', label: 'Entrenamiento' },
];

export default function App() {
  const [section, setSection] = useState('timer');
  const [practiceTarget, setPracticeTarget] = useState(null); 
  const [almanacCase, setAlmanacCase] = useState(null);
  const { settings, update: updateSettings } = useSettings();
  const solvesApi = useSolves();
  const attemptsApi = useAttempts();
  const almanac = useAlmanac();
  useEffect(() => {
    document.documentElement.dataset.theme = section === 'training' || section === 'almanac' ? 'training' : 'timer';
  }, [section]);
  const busyRef = useRef(false); 
  const sync = useSync({ shouldSkip: () => busyRef.current });

  return (
    <div className="app" data-section={section}>
      <NavTabs
        sections={SECTIONS} 
        active={section}
        onChange={(id) => {
          if (id === 'training') setPracticeTarget(null);
          if (id === 'almanac') setAlmanacCase(null);
          setSection(id);
        }}
      />

      {section === 'timer' && (
        <TimerPage settings={settings} updateSettings={updateSettings} solvesApi={solvesApi} busyRef={busyRef} />
      )}
      {section === 'calendar' && (
        <CalendarPage settings={settings} solvesApi={solvesApi} attemptsApi={attemptsApi} />
      )}

      {section === 'almanac' && (
        <AlmanacPage
          key={almanacCase ?? 'libre'}
          settings={settings}
          almanac={almanac}
          attemptsApi={attemptsApi}
          initialCaseId={almanacCase}
          onPractice={(target) => {
            setPracticeTarget(target);
            setSection('training');
          }}
        />
      )}

      {section === 'training' && (
        <TrainingPage 
          key={practiceTarget ? `${practiceTarget.zoneId}:${practiceTarget.caseId}:${practiceTarget.algorithmId}` : 'libre'}
          settings={settings} 
          attemptsApi={attemptsApi} 
          almanac={almanac}
          busyRef={busyRef} 
          target={practiceTarget}
          onOpenCase={(id) => {
            setAlmanacCase(id);
            setSection('almanac');
          }}
        />
      )}

      <footer className="chrome footer">
        <SyncPanel sync={sync} />
        <div>v{__APP_VERSION__}</div>
      </footer>
    </div>
  );
}
