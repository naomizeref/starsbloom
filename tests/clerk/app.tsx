import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {BloomAuthProvider} from '../../src/components/auth/BloomAuthProvider';
import {useCurrentUser} from '../../src/hooks/useCurrentUser';
import {supabase} from '../../src/lib/supabase';
import {signOutBloom} from '../../src/lib/authRuntime';
import {sendTransactionalEmail} from '../../src/lib/emailClient';
import '../../src/index.css';
function Session(){const current=useCurrentUser();return <main>
  <output aria-label="Identity">{JSON.stringify({id:current.user?.id,profile:current.profile?.id,admin:current.isAdmin,ready:current.isReady})}</output>
  <button onClick={()=>void signOutBloom(supabase)}>Log out</button>
  <button onClick={()=>void sendTransactionalEmail('test@example.invalid','WELCOME',{eventId:'test-welcome'})}>Email</button>
</main>;}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><BloomAuthProvider><Session/></BloomAuthProvider></BrowserRouter></StrictMode>);
