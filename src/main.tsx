import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { AccessGate } from './components/Layout/AccessGate';
import { watchMonthRollover } from './utils/monthRollover';
import './styles/main.scss';

watchMonthRollover();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <AuthProvider>
        <AccessGate>
          <App />
        </AccessGate>
      </AuthProvider>
    </React.StrictMode>
  );
}
