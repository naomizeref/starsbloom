import { isFreshQuote } from "../lib/marketQuotes";
import React, { useState } from "react";
import { useOrbit } from "../context/OrbitContext";
import { TradingViewWidget } from "../components/TradingViewWidget";
import { Eye, EyeOff, ChevronDown, ArrowUpRight, Loader2 } from "lucide-react";
import { formatMarketPrice, formatMarketChange } from "../lib/tradingDisplay";

interface DashboardTradingProps {
  initialAsset?: string;
  onNavigate: (view: string) => void;
}

export const DashboardTrading: React.FC<DashboardTradingProps> = ({ initialAsset, onNavigate }) => {
  const { marketCrypto, marketStocks, user, isLoadingMarkets, refreshMarkets, executeTrade, setInsufficientBalanceOpen } = useOrbit();
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState(initialAsset || "BTC/USD");
  const [showBalance, setShowBalance] = useState(true);
  const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });

  const fullMarketList = [...marketCrypto, ...marketStocks];
  // Keep the selected pair when a partial feed omits it; never silently trade another asset.
  const quotedAsset = fullMarketList.find(a => a.symbol === selectedAssetSymbol || `${a.symbol}/USD` === selectedAssetSymbol);
  const hasQuote = !!quotedAsset && isFreshQuote(quotedAsset);
  const activeAsset = quotedAsset || { symbol: selectedAssetSymbol, name: "Unavailable", price: 0, change: 0 };
  const [submitting, setSubmitting] = useState(false);

  // Buy/Sell form parameters
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [amountInputTxt, setAmountInputTxt] = useState("");

  // Execution notification logs
  const [log, setLog] = useState<string | null>(null);

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setLog(null);
    if (!hasQuote || !isFreshQuote(quotedAsset)) { triggerLog("Error: Market quote unavailable. Please wait for market data."); return; }

    if (!user.isLoggedIn) {
      onNavigate("auth");
      return;
    }

    const amountValue = parseFloat(amountInputTxt);
    if (!Number.isFinite(amountValue) || amountValue < 10) {
      triggerLog("Error: Enter an amount of at least $10.");
      return;
    }

    const orderPrice = activeAsset.price;
    if (!orderPrice || orderPrice <= 0) {
      triggerLog("Error: This price is unavailable. Refresh quotes and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await executeTrade(
        activeAsset.symbol,
        activeAsset.name,
        tradeType,
        amountValue,
        orderPrice,
        marketCrypto.some(asset => asset.symbol === activeAsset.symbol)
      );

      if (result.success) {
        setAmountInputTxt("");
        triggerLog(result.message);
      } else {
        if (result.message === "INSUFFICIENT_BALANCE") {
          setInsufficientBalanceOpen(true);
        } else {
          triggerLog(`Error: ${result.message}`);
        }
      }
    } catch { triggerLog("Error: Unable to submit your order. Please try again."); }
    finally { setSubmitting(false); }
  };

  const triggerLog = (msg: string) => {
    setLog(msg);
    setTimeout(() => setLog(null), 6000);
  };

  const baseSymbol = activeAsset.symbol.split("/")[0];
  const enteredAmount = Number(amountInputTxt);
  const estimatedQuantity = hasQuote && Number.isFinite(enteredAmount) && enteredAmount > 0
    ? enteredAmount / activeAsset.price : 0;
  const holding = user.portfolio.find(asset => asset.symbol === activeAsset.symbol || asset.symbol === baseSymbol);
  const selectAsset = (symbol: string) => { setSelectedAssetSymbol(symbol); setLog(null); };

  return (
    <div className="space-y-4 pb-6">
      <section aria-label="Selected market" className="rounded-2xl border border-orbit-border bg-orbit-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor="trading-pair" className="sr-only">Active Trading Pair</label>
            <select id="trading-pair" value={activeAsset.symbol} disabled={submitting}
              onChange={event => selectAsset(event.target.value)}
              className="max-w-full min-h-11 rounded-lg border border-orbit-border bg-orbit-bg px-3 text-base font-semibold text-orbit-white">
              {!quotedAsset && <option value={selectedAssetSymbol}>{selectedAssetSymbol}</option>}
              {fullMarketList.map(asset => <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>)}
            </select>
          </div>
          <span className="shrink-0 rounded-full border border-orbit-border px-3 py-1 text-xs text-orbit-gray-text">Spot trading</span>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
          <strong className="text-2xl sm:text-3xl font-semibold tracking-tight text-orbit-white">{hasQuote ? formatMarketPrice(activeAsset.price) : "—"}</strong>
          <span className={`text-sm font-medium ${!hasQuote ? "text-orbit-gray-text" : activeAsset.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {hasQuote ? formatMarketChange(activeAsset.change) : "—"}<span className="ml-1.5 text-xs font-normal text-orbit-gray-text">24h</span>
          </span>
        </div>
        {!hasQuote && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-orbit-border pt-3 text-sm">
          <p role="status" className="text-orbit-gray-text">{isLoadingMarkets ? "Updating price…" : "Price unavailable · Orders paused"}</p>
          {!isLoadingMarkets && <button type="button" onClick={() => void refreshMarkets()} className="min-h-11 text-orbit-accent underline underline-offset-4">Retry quotes</button>}
        </div>}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <TradingViewWidget symbol={activeAsset.symbol} history={quotedAsset?.sparkline} />

        <section aria-label="Order ticket" className="min-w-0 rounded-2xl border border-orbit-border bg-orbit-card p-4 sm:p-5">
          <form onSubmit={handleOrderSubmit} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-orbit-white">Place order</h2>
              <span className="text-xs text-orbit-gray-text">Market</span>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-orbit-border bg-orbit-bg p-1">
              {(["buy", "sell"] as const).map(side => <button key={side} type="button" disabled={submitting}
                aria-pressed={tradeType === side} onClick={() => { setTradeType(side); setLog(null); }}
                className={`min-h-11 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${tradeType === side ? side === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400" : "text-orbit-gray-text"}`}>
                {side === "buy" ? "Buy" : "Sell"}
              </button>)}
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span className="text-orbit-gray-text">{tradeType === "buy" ? "Available cash" : `Available ${baseSymbol}`}</span>
              <div className="flex items-center gap-1 tabular-nums">
                <strong className="font-medium text-orbit-white">{showBalance ? tradeType === "buy" ? money(user.balance) : (holding?.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 8 }) : "••••••"}</strong>
                <button type="button" onClick={() => setShowBalance(value => !value)} aria-label={showBalance ? "Hide balance" : "Show balance"}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-orbit-gray-text hover:text-orbit-white">
                  {showBalance ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>
            {log && <p role={log.startsWith("Error") ? "alert" : "status"}
              className={`rounded-lg border p-3 text-sm ${log.startsWith("Error") ? "border-rose-500/30 text-rose-300" : "border-emerald-500/30 text-emerald-300"}`}>{log}</p>}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <label htmlFor="trade-amount" className="text-orbit-white">Order amount (USD)</label>
                <span className="text-xs text-orbit-gray-text">Min. $10</span>
              </div>
              <input type="number" inputMode="decimal" id="trade-amount" min="10" step="0.01" required
                disabled={submitting || !hasQuote} value={amountInputTxt} onChange={event => setAmountInputTxt(event.target.value)} placeholder="0.00"
                className="min-h-12 w-full rounded-xl border border-orbit-border bg-orbit-bg px-4 py-3 text-sm font-medium tabular-nums text-orbit-white placeholder:text-slate-500 focus:border-orbit-accent focus:outline-none disabled:opacity-50" />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-orbit-gray-text">
              <span>Est. quantity</span>
              <span className="text-right tabular-nums">{estimatedQuantity > 0 ? estimatedQuantity.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"} {baseSymbol}</span>
            </div>
            <button type="submit" disabled={submitting || !hasQuote}
              className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tradeType === "buy" ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300" : "bg-rose-500 text-white hover:bg-rose-400"}`}>
              {submitting ? <><Loader2 size={16} className="animate-spin" />Submitting…</> : `${tradeType === "buy" ? "Buy" : "Sell"} ${baseSymbol}`}
            </button>
          </form>
        </section>
      </div>

      <details className="group rounded-2xl border border-orbit-border bg-orbit-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <h2 className="text-sm font-semibold text-orbit-white">Market watchlist <span className="ml-2 text-xs font-normal text-orbit-gray-text">{fullMarketList.length}</span></h2>
          <ChevronDown size={16} className="text-orbit-gray-text transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-orbit-border p-3">
          {!fullMarketList.length ? <p className="p-2 text-sm text-orbit-gray-text">{isLoadingMarkets ? "Loading markets…" : "No prices available."}</p> :
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{fullMarketList.map(item => <button key={item.symbol} type="button" disabled={submitting}
              aria-label={`Select ${item.name}`} aria-pressed={activeAsset.symbol === item.symbol} onClick={() => selectAsset(item.symbol)}
              className={`flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${activeAsset.symbol === item.symbol ? "border-orbit-accent/40 bg-orbit-accent/10" : "border-transparent hover:bg-orbit-bg"}`}>
              <span className="min-w-0"><span className="block text-sm font-medium text-orbit-white">{item.symbol}</span><span className="block truncate text-xs text-orbit-gray-text">{item.name}</span></span>
              <span className="shrink-0 text-right tabular-nums"><span className="block text-sm text-orbit-white">{isFreshQuote(item) ? formatMarketPrice(item.price) : "—"}</span><span className={`block text-xs ${item.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{isFreshQuote(item) ? formatMarketChange(item.change) : "—"}</span></span>
            </button>)}</div>}
        </div>
      </details>

      <section className="rounded-2xl border border-orbit-border bg-orbit-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-orbit-white">Holdings <span className="ml-2 font-normal text-orbit-gray-text">{user.portfolio.length}</span></h2>
          <button type="button" onClick={() => onNavigate("dashboard-portfolio")} className="flex min-h-11 items-center gap-1 text-xs text-orbit-accent">Portfolio<ArrowUpRight size={14} /></button>
        </div>
        {user.portfolio.length === 0 ? <p className="text-sm text-orbit-gray-text">No holdings yet.</p> :
          <div className="mt-2 divide-y divide-orbit-border">{user.portfolio.map(asset => {
            const quote = fullMarketList.find(item => item.symbol === asset.symbol || item.symbol === `${asset.symbol}/USD`);
            const current = !!quote && isFreshQuote(quote);
            const value = asset.amount * (current ? quote.price : asset.currentPrice);
            return <div key={asset.symbol} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="font-medium text-orbit-white">{asset.symbol}</p><p className="text-xs text-orbit-gray-text">{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} units</p></div>
              <div className="text-right"><p className="tabular-nums text-orbit-white">{money(value)}</p><p className="text-xs text-orbit-gray-text">{current ? "Value" : "Last value"}</p></div>
            </div>;
          })}</div>}
      </section>
    </div>
  );
};
