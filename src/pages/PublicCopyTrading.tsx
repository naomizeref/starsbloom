import React, { useEffect, useRef, useState } from "react";
import { useSeo } from "../lib/useSeo";
import { useOrbit } from "../context/OrbitContext";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { CopyPositions } from "../components/CopyPositions";
import type { TraderProfile } from "../types";
import { Search, X, Users, ArrowRight, Loader2 } from "lucide-react";

const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });
const minimum = (t: TraderProfile) => Math.max(0.01, t.minimumCopyAmount ?? 0);
const validTerms = (t: TraderProfile) => Number.isFinite(t.roi) && t.roi >= 0 && Number.isInteger(t.profitDays) && t.profitDays > 0;

export const PublicCopyTrading: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  useSeo({ title: "Copy Trading | Bloom", description: "Compare trader allocation terms and manage your copy positions on Bloom.", path: "/copy-trading" });
  const { traders, tradersLoading, tradersError, refreshTraders, user, investmentDataError } = useOrbit();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const selected = traders.find(t => t.id === selectedId);
  const available = traders.filter(t => t.active !== false);
  const visible = available.filter(t => `${t.name} ${t.country ?? ""} ${t.markets ?? ""} ${t.tradingStyle ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const unsettled = new Set(user.copyTrades.filter(t => t.status !== "Cancelled" && !t.payoutCompleted && !t.payoutTransactionId).map(t => t.traderId));
  const blocked = user.isLoggedIn && user.status !== "active";
  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 pb-20">
    <header className="space-y-3 max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-orbit-accent">Copy trading</p>
      <h1 className="text-3xl sm:text-4xl font-bold text-orbit-white"> Master Copy Trading</h1>
      <p className="text-sm leading-relaxed text-orbit-gray-text"> Automatically follow the trade of seasoned market experts. Choose your allocation, track performance with 100% transparency, and replicate elite positions with 0% hidden fees </p>
      <p className="text-xs text-orbit-gray-text"></p>
    </header>
    {success && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{success}</p>}
    {blocked && <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm">Your account is not active. Contact support before starting or changing allocations.</p>}
    <section aria-labelledby="trader-directory" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 id="trader-directory" className="text-xl font-bold text-orbit-white">Trader directory</h2><p className="text-xs text-orbit-gray-text mt-1">Review the current terms for each available trader.</p></div>
        <label className="flex items-center gap-2 border border-orbit-border rounded-xl px-3 bg-orbit-card"><Search size={16} aria-hidden="true" /><input aria-label="Search traders" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, market or country" className="min-w-0 w-full sm:w-64 py-3 bg-transparent text-sm outline-none" /></label>
      </div>
      {tradersError && <div role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm">{tradersError} <button type="button" disabled={tradersLoading} onClick={() => void refreshTraders()} className="underline ml-2">Retry traders</button></div>}
      {tradersLoading && !traders.length ? <p role="status" className="p-8 text-center">Loading traders…</p> : !visible.length ? <p className="p-8 border border-orbit-border rounded-xl text-sm text-orbit-gray-text">{search ? "No traders match your search." : tradersError ? "The trader directory is unavailable." : "No traders are accepting allocations right now."}</p> :
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{visible.map(t => {
          const existing = unsettled.has(t.id);
          return <article key={t.id} className="min-w-0 p-5 rounded-2xl bg-orbit-card border border-orbit-border flex flex-col gap-5">
            <div className="flex items-center gap-3 min-w-0"><Avatar trader={t} /><div className="min-w-0"><h3 className="font-semibold text-orbit-white break-words">{t.name}</h3><p className="text-xs text-orbit-gray-text break-words">{[t.country, t.tradingStyle].filter(Boolean).join(" · ") || "Trader profile"}</p></div></div>
            <dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-orbit-gray-text">Target return</dt><dd className="mt-1 font-semibold">{Number.isFinite(t.roi) ? `${t.roi}%` : "Unavailable"}</dd></div><div><dt className="text-xs text-orbit-gray-text">Duration</dt><dd className="mt-1 font-semibold">{t.profitDays > 0 ? `${t.profitDays} days` : "Unavailable"}</dd></div><div><dt className="text-xs text-orbit-gray-text">Minimum allocation</dt><dd className="mt-1 font-semibold">{money(minimum(t))}</dd></div><div><dt className="text-xs text-orbit-gray-text">Maximum allocation</dt><dd className="mt-1 font-semibold">{t.maximumCopyAmount ? money(t.maximumCopyAmount) : "No maximum"}</dd></div></dl>
            {t.markets && <p className="text-xs text-orbit-gray-text break-words">Markets: {t.markets}</p>}
            {t.biography && <p className="text-sm text-orbit-gray-text break-words line-clamp-3">{t.biography}</p>}
            <button type="button" aria-label={existing ? `View allocation with ${t.name}` : `Review ${t.name}`} disabled={!existing && (blocked || !!tradersError || !!investmentDataError || !validTerms(t))} onClick={() => {
              if (!user.isLoggedIn) { onNavigate("auth"); return; }
              if (existing) { document.getElementById("copy-positions")?.scrollIntoView({ behavior: "smooth" }); return; }
              setSuccess(""); setSelectedId(t.id);
            }} className="mt-auto min-h-11 flex items-center justify-center gap-2 rounded-xl bg-orbit-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{existing ? "View allocation" : !validTerms(t) ? "Terms unavailable" : "Review allocation"}<ArrowRight size={16} /></button>
          </article>;
        })}</div>}
    </section>
    {user.isLoggedIn && <CopyPositions />}
    <p className="text-xs text-orbit-gray-text leading-relaxed border-t border-orbit-border pt-5">Your allocation is deducted from your cash balance. Ending an eligible allocation early returns its principal only; target profit is forfeited. Matured allocations must be claimed. Account restrictions can pause allocations and payouts.</p>
    {selectedId && <AllocationDialog trader={selected} unavailable={!!tradersError || !!investmentDataError || blocked || !!selected && (selected.active === false || unsettled.has(selected.id))} onClose={() => setSelectedId(null)} onSuccess={message => { setSuccess(message); setSelectedId(null); }} onNavigate={onNavigate} />}
  </div>;
};

function Avatar({ trader }: { trader: TraderProfile }) {
  const [failed, setFailed] = useState(false);
  return trader.avatar && !failed ? <img src={trader.avatar} alt="" onError={() => setFailed(true)} className="w-12 h-12 rounded-full object-cover shrink-0" /> : <span className="w-12 h-12 rounded-full bg-orbit-accent/10 flex items-center justify-center shrink-0"><Users size={22} /></span>;
}

function AllocationDialog({ trader, unavailable, onClose, onSuccess, onNavigate }: { trader?: TraderProfile; unavailable: boolean; onClose: () => void; onSuccess: (message: string) => void; onNavigate: (view: string) => void }) {
  const { user, copyTrader } = useOrbit();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [amount, setAmount] = useState(trader ? String(minimum(trader)) : "");
  const [error, setError] = useState("");
  const [needsFunds, setNeedsFunds] = useState(false);
  useBodyScrollLock(true);
  useEffect(() => { const previous = document.activeElement as HTMLElement; const el = dialog.current!; el.showModal(); el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }); return () => { el.close(); previous?.focus({ preventScroll: true }); }; }, []);
  const value = Number(amount);
  const profit = trader && Number.isFinite(value) ? Math.round(value * trader.roi) / 100 : 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || !trader || unavailable) return;
    setError(""); setNeedsFunds(false);
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) { setError("Enter a positive amount with at most two decimal places."); return; }
    if (value < minimum(trader) || trader.maximumCopyAmount && value > trader.maximumCopyAmount) { setError("Enter an amount within this trader’s allocation range."); return; }
    if (value > user.balance) { setError("Your available balance is too low for this allocation."); setNeedsFunds(true); return; }
    busy.current = true; setPending(true);
    try {
      const result = await copyTrader(trader.id, value);
      if (result.success) onSuccess(`Allocation of ${money(value)} with ${trader.name} confirmed. Your saved position contains the final terms.`);
      else if (result.message === "AUTH_REQUIRED") setError("Your session has expired. Sign in again before confirming.");
      else if (result.message === "INSUFFICIENT_BALANCE") { setError("Your balance is too low. Add funds or reduce the amount."); setNeedsFunds(true); }
      else setError(result.message || "Unable to confirm the allocation. Refresh your positions before retrying.");
    } catch { setError("Unable to confirm the allocation. Check your positions before retrying; your request may have reached the server."); }
    finally { busy.current = false; setPending(false); }
  };
  return <dialog ref={dialog} aria-labelledby="allocation-title" onCancel={e => { e.preventDefault(); if (!busy.current) onClose(); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-orbit-card text-orbit-white border border-orbit-border p-5 sm:p-6 backdrop:bg-black/75">
    <div className="flex items-start justify-between gap-3"><h2 id="allocation-title" className="text-lg font-semibold break-words">Allocate to {trader?.name ?? "trader"}</h2><button type="button" aria-label="Close allocation" disabled={pending} onClick={onClose} className="p-2 shrink-0 disabled:opacity-50"><X size={20} /></button></div>
    <form onSubmit={submit} noValidate className="mt-5 space-y-4">
      <p className="text-sm text-orbit-gray-text">Available cash: <strong className="text-orbit-white">{money(user.balance)}</strong></p>
      <label className="block text-sm">Allocation amount (USD)<input autoFocus type="number" inputMode="decimal" min={trader ? minimum(trader) : 0.01} step="0.01" value={amount} disabled={pending} onChange={e => setAmount(e.target.value)} className="mt-2 w-full rounded-xl bg-orbit-bg border border-orbit-border p-3" /></label>
      {trader && <div className="rounded-xl bg-orbit-bg border border-orbit-border p-4 text-sm space-y-2"><p>Range: {money(minimum(trader))} – {trader.maximumCopyAmount ? money(trader.maximumCopyAmount) : "No maximum"}</p><p>Duration: {trader.profitDays} days · Target return: {trader.roi}%</p><p>Target profit: {money(profit)} · Total: {money(Number.isFinite(value) ? value + profit : 0)}</p><p className="text-xs text-orbit-gray-text">These are estimates based on the current catalog. The server saves the final terms when confirming. Early exit returns principal only.</p></div>}
      {!pending && (!trader || unavailable) && <p role="alert" className="text-sm text-amber-300">This allocation is unavailable or its data could not be refreshed. Close this dialog and refresh your positions.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {needsFunds && <button type="button" className="underline text-sm" onClick={() => { onClose(); onNavigate("dashboard-wallet"); }}>Add funds</button>}
      <div className="flex gap-3"><button type="button" disabled={pending} onClick={onClose} className="min-h-11 flex-1 border border-orbit-border rounded-xl disabled:opacity-50">Cancel</button><button type="submit" disabled={pending || unavailable || !trader || !validTerms(trader)} className="min-h-11 flex-1 rounded-xl bg-orbit-accent p-3 text-white disabled:opacity-50">{pending ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Confirming…</span> : "Confirm allocation"}</button></div>
    </form>
  </dialog>;
}
