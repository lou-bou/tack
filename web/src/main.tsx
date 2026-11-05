import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './themes/tokens.css';
import './styles/global.css';
import { App } from './App';
import { startSync } from './data';
import { startTrace } from './lib/trace';
import { startUpdates } from './lib/update';

startTrace();
startUpdates();
startSync();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
