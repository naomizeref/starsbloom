// Actual catalog/position hooks and screens; only the Supabase transport is fake.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useInvestmentPlans } from '../../src/hooks/data/useInvestmentPlans';
import { usePortfolio } from '../../src/hooks/data/usePortfolio';
import { useActiveInvestments } from '../../src/hooks/data/useActiveInvestments';
import { useTraders } from '../../src/hooks/data/useTraders';
import { DashboardPlans } from '../../src/pages/DashboardPlans';
import { AdminInvestmentsTab } from '../../src/components/admin/tabs/AdminInvestmentsTab';
import { InvestmentDataStatus } from '../../src/components/InvestmentDataStatus';
import './fixture';
import '../../src/index.css';
const controls = { failRead: true, failPortfolio: false, failWrite: false, zeroRows: false, delayA: false, writes: 0, lastAmount: 0 };
const plan = { id: 'plan-test', name: 'Saved plan', min_deposit: 10, max_deposit: 1000, roi_percent: 10, duration_days: 30, description: 'Stored investment terms', status: 'active', enabled: true, display_order: 10 };
const rows: Record<string, any[]> = { investment_plans: [plan], traders: [{ id: 'trader-test', name: 'Saved trader', roi: 10, profit_days: 30, active: true, max_copy_amount: 0, maximum_copy_amount: 999 }], active_investments: [], portfolio_assets: [{symbol:'BTC',name:'Saved holding',amount:1,avg_buy_price:100,current_price:100,type:'crypto'}] };
const client: any = { from: (table: string) => {
  let operation = 'read', value: any, id: string | null = null, owner: string | null = null;
  const execute = async (single = false) => {
    if (operation === 'read') {
      if (table === 'portfolio_assets' && controls.failPortfolio) return {error:{code:'PGRST205',message:'Could not find the table public.portfolio_assets'}};
      if (controls.failRead) return { error: { message: 'Connection unavailable' } };
      const data = table === 'active_investments' ? [{ id: `position-${owner}`, user_id: owner, plan_id: 'plan-test', plan_name: `Position for ${owner}`, amount: 100, start_date: new Date().toISOString(), end_date: new Date(Date.now()+86400000).toISOString(), roi_percent: 10, expected_profit: 10, total_return: 110, status: 'Running' }] : [...rows[table]];
      if (controls.delayA && owner === 'A') await new Promise(resolve => setTimeout(resolve, 900));
      return { data, error: null };
    }
    controls.writes++;
    if (controls.failWrite) return { error: { message: 'Permission denied', code: '42501' } };
    if (controls.zeroRows) return { data: null, error: null };
    if (operation === 'insert') rows[table].push(value);
    if (operation === 'update') rows[table] = rows[table].map(row => row.id === id ? { ...row, ...value } : row);
    if (operation === 'delete') rows[table] = rows[table].filter(row => row.id !== id);
    return { data: single ? value || { id } : rows[table], error: null };
  };
  const query: any = {
    select: () => query, order: () => query,
    eq: (key: string, v: string) => { if (key === 'id') id=v; if (key === 'user_id') owner=v; return query; },
    insert: (v: any) => { operation='insert'; value=v; return query; },
    update: (v: any) => { operation='update'; value=v; return query; },
    delete: () => { operation='delete'; return query; },
    single: () => execute(true), then: (resolve: any, reject: any) => execute().then(resolve,reject),
  };
  return query;
} };
function App() {
  const [view,setView] = useState('plans');
  const [owner,setOwner] = useState('A');
  const catalog = useInvestmentPlans(client);
  const positions = useActiveInvestments(client,true,owner);
  const holdings = usePortfolio(client,true,owner);
  const traders = useTraders(client,true,true,()=>{});
  const state = (window as any).__bloom.state;
  Object.assign(state, catalog, { user: { ...state.user, activeInvestments: [{id:'legacy',planId:'retired-plan',name:'Existing saved position',amount:100,expectedProfit:10,totalReturn:110,accumulatedProfit:10,remainingDays:0,progress:100,status:'Completed',endDate:new Date().toISOString()}] }, investInPlan: async (_id: string,amount: number) => {controls.lastAmount=amount;return {success:true,message:'Investment accepted'};}, investmentDataError: catalog.plansError || positions.investmentsError || traders.tradersError || holdings.portfolioError, investmentDataLoading: catalog.plansLoading || positions.investmentsLoading || traders.tradersLoading || holdings.portfolioLoading,
    refreshInvestmentData: async () => { await Promise.all([catalog.refreshPlans(), positions.refreshActiveInvestments(), traders.refreshTraders(), holdings.refreshPortfolio()]); },
    adminCreatePlan: catalog.createPlan, adminUpdatePlan: catalog.savePlan, adminDeletePlan: catalog.deletePlan, adminSetPlanStatus: (id: string,status: string) => catalog.setPlanEnabled(id,status==='active'),
  });
  (window as any).__investments = { controls, rows, catalog, traders, positions, holdings, setOwner };
  return <main className="min-h-screen bg-orbit-bg p-3 text-orbit-white">
    <nav><button onClick={()=>setView('plans')}>User plans</button> <button onClick={()=>setView('admin')}>Admin plans</button></nav>
    <output aria-label="Loaded holdings">{holdings.portfolio.map(p=>p.name).join(",")}</output>
    <output aria-label="Loaded positions">{positions.activeInvestments.map(p=>p.name).join(',')}</output>
    {view==='plans' ? <DashboardPlans /> : <><InvestmentDataStatus /><AdminInvestmentsTab /></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
