import React from 'react';
import { createRoot } from 'react-dom/client';
import { useCurrentUser } from '../../src/hooks/useCurrentUser';
import { supabase } from './fixture';
let listener: any;
let releaseInitial: any;
let inAuthCallback = false;
let violation = false;
const profiles: Record<string, any> = { A: { id:'A',role:'admin',balance:100 }, B: { id:'B',role:'user',balance:200 } };
const session = (id: string) => ({ user: {id,email:`${id}@example.com`} });
supabase.auth = {
  getSession: () => new Promise(resolve=>{releaseInitial=()=>resolve({data:{session:session('A')}});}),
  onAuthStateChange: (fn: any) => { listener=fn; return {data:{subscription:{unsubscribe(){}}}}; },
};
supabase.from = () => ({
  upsert: async () => { if(inAuthCallback) violation=true; },
  select: () => ({ eq: (_: string,id: string) => ({ maybeSingle: async () => {
    if(inAuthCallback) violation=true;
    if(id==='A') await new Promise(resolve=>setTimeout(resolve,800));
    return {data:profiles[id],error:null};
  } }) }),
});
(window as any).__auth = {
  switch: (id: string | null) => {inAuthCallback=true;listener('SIGNED_IN',id ? session(id) : null);inAuthCallback=false;},
  releaseInitial: ()=>releaseInitial(), violation: ()=>violation,
};
function App(){const current=useCurrentUser();return <output aria-label="Identity">{JSON.stringify({id:current.user?.id,profile:current.profile?.id,admin:current.isAdmin})}</output>;}
createRoot(document.getElementById('root')!).render(<App />);
