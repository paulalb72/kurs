import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Gate } from './components/Gate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
);

// Service Worker nur im gebauten Zustand – im Dev-Modus würde er alte Stände festhalten.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
