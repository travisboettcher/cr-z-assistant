import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignProvider } from './state/CampaignProvider';
import { App } from './ui/App';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element in index.html');
}

createRoot(root).render(
  <StrictMode>
    {/* The store wraps the whole tree: `useCampaign` throws outside it, so
        there is no partial mount where a component quietly dispatches into a
        void. Z0-10 restores a saved campaign by passing `initialState` here. */}
    <CampaignProvider>
      <App />
    </CampaignProvider>
  </StrictMode>,
);
