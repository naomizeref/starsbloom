import React, { useRef, useState } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { InvestmentDataStatus } from './InvestmentDataStatus';
const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export function CopyPositions({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const { user, uncopyTrader, claimCopyTradePayout, refreshInvestmentData, investmentDataError } = useOrbit();
  const [pending, setPending] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [settledIds, setSettledIds] = useState<string[]>([]);
  const open = user.copyTrades.filter(t => t.status !== 'Cancelled' && !t.payoutCompleted && !t.payoutTransactionId);
  const history = user.copyTrades.filter(t => t.status === 'Cancelled' || t.payoutCompleted || t.payoutTransactionId);
  const act = async (id: string, cancel: boolean, principal: number) => {
    if (inFlight.current) return;
    if (cancel && !window.confirm(`End this allocation and return ${money(principal)} to your cash balance? Target profit will be forfeited.`)) return;
    inFlight.current = true; setPending(id); setFeedback(null);
    try {
      const result = cancel ? await uncopyTrader(id) : await claimCopyTradePayout(id);
      if (result && !result.success) setFeedback({ error: true, text: result.message });
      else {
        setSettledIds(ids => [...ids, id]);
        setFeedback({ error: false, text: cancel ? 'Allocation ended. Its principal was returned to your cash balance.' : 'Payout confirmed. Refresh your positions if this card has not updated.' });
      }
    } catch { setFeedback({ error: true, text: 'Unable to confirm this action. Refresh your positions before trying again.' }); }
    finally { inFlight.current = false; setPending(null); }
  };
  return <section id="copy-positions" aria-labelledby="copy-positions-title" className="space-y-4 scroll-mt-24">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 id="copy-positions-title" className="text-xl font-semibold">Your copy allocations</h2><div className="flex flex-wrap gap-4">{onNavigate && <button type="button" onClick={() => onNavigate("copy-trading")} className="min-h-11 text-sm text-orbit-accent underline">Browse traders</button>}<button type="button" onClick={() => void refreshInvestmentData()} disabled={!!pending} className="min-h-11 text-sm underline">Refresh positions</button></div></div>
    <InvestmentDataStatus />
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`p-3 rounded-xl border text-sm ${feedback.error ? 'border-red-400/30 text-red-300' : 'border-emerald-400/30 text-emerald-300'}`}>{feedback.text}</p>}
    {!open.length && <p className="text-sm text-orbit-gray-text py-4">No open copy allocations. {onNavigate ? "Browse traders to review their terms." : "Choose a trader above to review their terms."}</p>}
    <div className="grid md:grid-cols-2 gap-4">{open.map(trade => {
      const paused = !!trade.pausedAt;
      const matured = trade.status === 'Completed' || Date.parse(trade.endTimestamp) <= Date.now();
      const settled = settledIds.includes(trade.id);
      const disabled = !!pending || paused || user.status !== 'active' || !!investmentDataError || settled;
      return <article key={trade.id} className="min-w-0 rounded-xl border border-orbit-border bg-orbit-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold break-words">{trade.traderName}</h3><span className="text-xs text-orbit-gray-text">{settled ? 'Confirmed · refreshing' : paused ? 'Paused' : matured ? 'Ready to claim' : 'Running'}</span></div>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-orbit-gray-text">Principal</dt><dd>{money(trade.amountInvested)}</dd></div><div><dt className="text-orbit-gray-text">Saved return rate</dt><dd>{trade.roiPercent}%</dd></div><div><dt className="text-orbit-gray-text">Target profit</dt><dd>{money(trade.expectedProfit)}</dd></div><div><dt className="text-orbit-gray-text">Maturity payout</dt><dd>{money(trade.totalReturn)}</dd></div></dl>
        <progress aria-label={`Duration progress for ${trade.traderName}`} value={Number.isFinite(trade.progress) ? trade.progress : 0} max={100} className="w-full h-2 accent-orbit-accent" />
        <p className="text-xs text-orbit-gray-text">{paused ? 'Countdown paused while the account is restricted.' : `Maturity: ${new Date(trade.endTimestamp).toLocaleString()}`}</p>
        <button type="button" disabled={disabled} onClick={() => void act(trade.id, !matured, trade.amountInvested)} className="min-h-11 w-full rounded-xl border border-orbit-accent/40 text-orbit-accent p-3 text-sm font-semibold disabled:opacity-50">{pending === trade.id ? 'Processing…' : matured ? `Claim payout ${money(trade.totalReturn)}` : 'End allocation'}</button>
      </article>;
    })}</div>
    <details className="border-t border-orbit-border pt-4"><summary className="cursor-pointer min-h-11 text-sm font-semibold">Allocation history ({history.length})</summary>
      {!history.length ? <p className="text-sm text-orbit-gray-text">No settled allocations yet.</p> : <div className="space-y-3">{history.map(t => <div key={t.id} className="flex flex-wrap justify-between gap-3 p-4 rounded-xl border border-orbit-border text-sm"><span className="break-words">{t.traderName}</span><span>{t.status === 'Cancelled' ? `Cancelled · Principal returned ${money(t.amountInvested)}` : `Paid ${money(t.totalReturn)}`}</span></div>)}</div>}
    </details>
  </section>;
}
