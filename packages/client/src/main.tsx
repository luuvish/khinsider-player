import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initializeCsrfToken, hasCsrfToken } from './api/client';
import './styles/index.css';

// SECURITY: Initialize CSRF token before rendering the app
// This ensures all state-changing requests have CSRF protection from the start
// Using .then() instead of .finally() to ensure proper initialization before render
initializeCsrfToken()
  .then(() => {
    // SECURITY: Verify CSRF token was actually obtained
    if (!hasCsrfToken()) {
      console.warn('[Security] CSRF token initialization failed - some features may not work');
    }
  })
  .catch((err) => {
    // Log error but still render app (degraded functionality is better than no app)
    console.error('[Security] CSRF token initialization error:', err);
  })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
