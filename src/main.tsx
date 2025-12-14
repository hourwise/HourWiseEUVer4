import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css';

// 1. Renaming for clarity: distinction between the DOM node and the React Root
const container = document.getElementById('root');

// 2. Runtime Null Check
if (!container) {
  // A specific error helps debugging significantly
  throw new Error(
    "Root element with ID 'root' was not found in the document. \n" +
    "Ensure there is a corresponding HTML element with the ID 'root' in your index.html."
  );
}

// 3. Creation of the React Root
const root = createRoot(container);

// 4. Rendering
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
