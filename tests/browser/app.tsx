import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardWallet } from '../../src/pages/DashboardWallet';
import { DashboardKYC } from '../../src/pages/DashboardKYC';
import { GlobalModals } from '../../src/components/GlobalModals';
import { AdminDepositsTab } from '../../src/components/admin/tabs/AdminDepositsTab';
import { AdminKycTab } from '../../src/components/admin/tabs/AdminKycTab';
import '../../src/index.css';
function App() {
  const [view,setView] = useState('wallet');
  const [modal,setModal] = useState(false);
  return <main className="min-h-screen bg-orbit-bg p-3 text-orbit-white sm:p-6">
    <nav className="mb-5 flex flex-wrap gap-4">{['wallet','kyc','deposits','review'].map(v => <button key={v} onClick={() => setView(v)}>{v}</button>)}<button onClick={() => setModal(true)}>Quick deposit</button></nav>
    {view==='wallet' && <DashboardWallet />}{view==='kyc' && <DashboardKYC />}
    {view==='deposits' && <AdminDepositsTab />}{view==='review' && <AdminKycTab />}
    <GlobalModals depositModalOpen={modal} setDepositModalOpen={setModal} withdrawModalOpen={false} setWithdrawModalOpen={() => {}} onNavigate={() => {}} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
