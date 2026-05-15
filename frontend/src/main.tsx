import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

const storedPath = sessionStorage.getItem('gpt-actions-hub-path');

if (storedPath) {
  sessionStorage.removeItem('gpt-actions-hub-path');
  window.history.replaceState({}, '', storedPath);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
