import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Explainer from './content/explainer.mdx';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found.');
}

createRoot(root).render(
  <StrictMode>
    <main className="explainer-shell" data-ve-theme="iso">
      <Explainer />
    </main>
  </StrictMode>,
);
