import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { BloomAuthProvider } from '../../src/components/auth/BloomAuthProvider';
import { ClerkAuthPage } from '../../src/pages/ClerkAuthPage';
import { useCurrentUser } from '../../src/hooks/useCurrentUser';
import '../../src/index.css';

function App() {
  const current = useCurrentUser();
  return current.user ? <output aria-label="Identity">{JSON.stringify({ id: current.user.id, admin: current.isAdmin })}</output>
    : <main className="min-h-svh bg-orbit-bg px-4 py-8 flex justify-center"><ClerkAuthPage
      initialTab={new URLSearchParams(location.search).get('tab') === 'login' ? 'login' : 'register'}
      onNavigate={view => { location.hash = view; }} /></main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><BloomAuthProvider><App /></BloomAuthProvider></BrowserRouter>);
