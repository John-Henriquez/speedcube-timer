import { useRef, useState } from 'react';
import { useAttempts } from './hooks/useAttempts.js';
import { useSettings } from './hooks/useSettings.js';
import { useSolves } from './hooks/useSolves.js';
import { useSync } from './hooks/useSync.js';
import NavTabs from './components/NavTabs.jsx';
import SyncPanel from './components/SyncPanel.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import TimerPage from './pages/TimerPage.jsx';
import TrainingPage from './pages/TrainingPage.jsx';

const SECTIONS = [
  { id: 'timer', label: 'Timer' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'training', label: 'Entrenamiento' },
];

export default function App() {
  const [section, setSection] = useState('timer');
  const { settings, update: updateSettings } = useSettings();
  const solvesApi = useSolves();
  const attemptsApi = useAttempts();
  const busyRef = useRef(false); // true mientras algún timer corre: no se sincroniza en ese momento
  const sync = useSync({ shouldSkip: () => busyRef.current });

  return (
    <div className="app" data-section={section}>
      <NavTabs sections={SECTIONS} active={section} onChange={setSection} />

      {section === 'timer' && (
        <TimerPage settings={settings} updateSettings={updateSettings} solvesApi={solvesApi} busyRef={busyRef} />
      )}
      {section === 'calendar' && (
        <CalendarPage settings={settings} solvesApi={solvesApi} attemptsApi={attemptsApi} />
      )}

      {section === 'training' && (
        <TrainingPage settings={settings} attemptsApi={attemptsApi} busyRef={busyRef} />
      )}

      <footer className="chrome footer">
        <SyncPanel sync={sync} />
        <div>v{__APP_VERSION__}</div>
      </footer>
    </div>
  );
}
