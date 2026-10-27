import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Gate } from './components/Gate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
);
