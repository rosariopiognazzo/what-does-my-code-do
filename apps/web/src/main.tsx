import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles.css';

function App() {
  return (
    <main className="shell">
      <p className="eyebrow">WDMCD v1</p>
      <h1>What does my code do?</h1>
      <p>The local semantic project map is ready for its first analyzer.</p>
    </main>
  );
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
