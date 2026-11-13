
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import App from './App.jsx';

import './styles/variables.css';
import './styles/global.css';

import './styles/components/controls.css';
import './styles/components/timer-display.css';
import './styles/components/scramble-view.css';
import './styles/components/stats-panel.css';
import './styles/components/session-list.css';
import './styles/components/settings.css';
import './styles/components/daily-goal.css';
import './styles/components/calendar.css';
import './styles/components/cube-view.css';
import './styles/components/sync.css';
import './styles/components/training.css';
import './styles/components/postit.css';
import './styles/components/almanac.css';
import './styles/pages.css';


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
