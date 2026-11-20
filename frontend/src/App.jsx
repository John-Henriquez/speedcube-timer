import { useEffect, useRef, useState } from 'react';
import { useAlmanac } from './hooks/useAlmanac.js';
import { useAttempts } from './hooks/useAttempts.js';
import { useSettings } from './hooks/useSettings.js';
import { useSolves } from './hooks/useSolves.js';
import { AuthProvider } from './auth/AuthContext.jsx';
import { parseResetHash } from './auth/resetLink.js';
import NavTabs from './components/NavTabs.jsx';
import SyncBadge from './components/account/SyncBadge.jsx';
import AccountPage from './pages/AccountPage.jsx';
import AlmanacPage from './pages/AlmanacPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import TimerPage from './pages/TimerPage.jsx';
import TrainingPage from './pages/TrainingPage.jsx';

const SECTIONS = [
  { id: 'timer', label: 'Timer' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'almanac', label: 'Almanaque' },
  { id: 'training', label: 'Entrenamiento' },
  { id: 'account', label: 'Cuenta' },
];

function Shell({ busyRef }) {
  // Si se llega desde el enlace del correo de recuperación (#/reset?...), se abre directo la pantalla de contraseña nueva.
  const [resetParams, setResetParams] = useState(() => parseResetHash(globalThis.location?.hash));
  const [section, setSection] = useState(resetParams ? 'account' : 'timer');
  const [practiceTarget, setPracticeTarget] = useState(null); 
  const [almanacCase, setAlmanacCase] = useState(null);
  const { settings, update: updateSettings } = useSettings();
  const solvesApi = useSolves();
  const attemptsApi = useAttempts();
  const almanac = useAlmanac();
  useEffect(() => {
    document.documentElement.dataset.theme = section === 'training' || section === 'almanac' ? 'training' : 'timer';
  }, [section]);

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

      {section === 'account' && (
        <AccountPage
          resetParams={resetParams}
          onResetDone={() => {
            setResetParams(null);
            globalThis.history?.replaceState(null, '', globalThis.location.pathname + globalThis.location.search); // quita el token de la dirección
          }}
        />
      )}

      <footer className="chrome footer">
        <SyncBadge onClick={() => setSection('account')} />
        <div>v{__APP_VERSION__}</div>
      </footer>
    </div>
  );
}

export default function App() {
  const busyRef = useRef(false); // true mientras algún timer corre: no se sincroniza en ese momento
  return (
    <AuthProvider shouldSkip={() => busyRef.current}>
      <Shell busyRef={busyRef} />
    </AuthProvider>
  );
}
