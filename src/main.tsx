import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { BloomAuthProvider } from './components/auth/BloomAuthProvider';
import './index.css';
import { installChunkReloadHandler } from './lib/chunkReload';
import { isAuthPage, loadAuthPage } from './lib/authPageLoader';

// Recover automatically when a redeploy leaves this tab pointing at old,
// now-missing chunk hashes (stale-chunk-after-deploy). Must run before render.
installChunkReloadHandler();
if (isAuthPage(window.location.pathname)) void loadAuthPage().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <BloomAuthProvider><App /></BloomAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
