import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './themes/tokens.css';
import './styles/global.css';
import { DeviceTest } from './pages/DeviceTest';

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <DeviceTest />
  </StrictMode>,
);
