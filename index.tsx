import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Registo do Service Worker de forma robusta
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Constrói o caminho para o SW baseado no URL atual para garantir a mesma origem
    try {
      const swUrl = new URL('./sw.js', window.location.href).href;
      navigator.serviceWorker.register(swUrl)
        .then(reg => {
          console.log('Service Worker registado com sucesso no âmbito:', reg.scope);
        })
        .catch(err => {
          console.error('Falha no registo do Service Worker:', err);
        });
    } catch (e) {
      console.warn('Não foi possível inicializar o Service Worker neste ambiente:', e);
    }
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);