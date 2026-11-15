import React, { useEffect, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

const cryptoSymbols = new Set(["BTC", "ETH", "SOL", "XRP", "ADA", "BNB", "DOT", "DOGE", "SHIB", "LTC"]);
export function chartSymbol(symbol: string) {
  if (symbol.includes(":")) return symbol;
  const base = symbol.replace(/\/(USD|USDT)$|USDT$|USD$/, "");
  return cryptoSymbols.has(base) ? `BINANCE:${base}USDT` : `NASDAQ:${symbol}`;
}

interface TradingViewWidgetProps {
  symbol: string;
  history?: number[];
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({ symbol, history = [] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [interval, setInterval] = useState("60");
  const formattedSymbol = chartSymbol(symbol);
  const points = history.filter(value => Number.isFinite(value) && value > 0).map(price => ({ price }));

  useEffect(() => {
    const container = containerRef.current!;
    let disposed = false;
    let frame: HTMLIFrameElement | null = null;
    setStatus("loading");
    container.replaceChildren();
    const failed = () => { if (!disposed) setStatus("failed"); };
    const timer = window.setTimeout(failed, 15000);
    const loaded = () => {
      window.clearTimeout(timer);
      if (!disposed) setStatus("ready");
    };
    // The official embed owns its iframe; each instance gets an isolated loader.
    const observer = new MutationObserver(() => {
      const next = container.querySelector("iframe");
      if (next && next !== frame) {
        frame?.removeEventListener("load", loaded);
        frame = next;
        frame.title = `${symbol} reference chart`;
        frame.addEventListener("load", loaded);
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.onerror = failed;
    script.textContent = JSON.stringify({
      autosize: true, symbol: formattedSymbol, interval, timezone: "Etc/UTC",
      theme: "dark", style: "1", locale: "en", allow_symbol_change: false,
      hide_side_toolbar: true, hide_top_toolbar: true, hide_legend: true, hide_volume: true, enable_publishing: false,
      backgroundColor: "#0F131C", gridColor: "rgba(30, 35, 47, 0.6)",
    });
    container.append(widget, script);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      observer.disconnect();
      frame?.removeEventListener("load", loaded);
      script.onerror = null;
      container.replaceChildren();
    };
  }, [symbol, formattedSymbol, attempt, interval]);

  return <section aria-label={`${symbol} price chart`} className="min-w-0 border border-orbit-border rounded-2xl overflow-hidden bg-orbit-card">
    <div className="flex items-center justify-between gap-3 border-b border-orbit-border px-4 py-2">
      <h2 className="text-sm font-semibold text-orbit-white">Chart</h2>
      <div role="group" aria-label="Chart timeframe" className="flex gap-1">
        {[["15", "15m"], ["60", "1h"], ["D", "1D"]].map(([value, label]) => <button key={value} type="button"
          aria-pressed={interval === value} onClick={() => setInterval(value)}
          className={`min-h-11 min-w-11 rounded-lg px-2 text-xs font-medium ${interval === value ? "bg-orbit-accent/15 text-blue-300" : "text-orbit-gray-text hover:text-orbit-white"}`}>{label}</button>)}
      </div>
    </div>
    <div className="relative h-[300px] sm:h-[380px] lg:h-[400px]">
      <div ref={containerRef} className={`tradingview-widget-container w-full h-full ${status === "failed" ? "invisible" : ""}`} />
      {status === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-orbit-card text-sm text-orbit-gray-text pointer-events-none"><p>Loading {symbol} chart…</p></div>}
      {status === "failed" && <div className="absolute inset-0 flex flex-col p-4 gap-3">
        <p className="text-sm text-orbit-gray-text">Chart unavailable.</p>
        <button type="button" className="text-sm underline text-orbit-accent self-start min-h-11" onClick={() => setAttempt(value => value + 1)}>Retry chart</button>
        {points.length > 1 ? <>
          <p className="text-xs text-orbit-gray-text">7-day price history (USD) · CoinGecko</p>
          <div className="flex-1 min-h-0" role="img" aria-label={`${symbol} 7-day USD price history`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={points}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip formatter={(value: number) => [`$${value.toLocaleString(undefined, { maximumSignificantDigits: 8 })}`, "Price"]} />
              <Line type="linear" dataKey="price" stroke="#4f82ff" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </> : null}
      </div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 border-t border-orbit-border text-[11px] text-orbit-gray-text">
      <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(formattedSymbol)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center underline underline-offset-4">TradingView ↗</a>
      <span>{status === "failed" && points.length > 1 ? "History: USD" : formattedSymbol.startsWith("BINANCE:") ? "Chart: USDT · Orders: USD" : "Reference chart"}</span>
    </div>
  </section>;
};
