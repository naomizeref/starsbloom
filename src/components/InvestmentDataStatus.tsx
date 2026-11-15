import React from "react";
import { useOrbit } from "../context/OrbitContext";

export function InvestmentDataStatus() {
  const { investmentDataError, investmentDataLoading, refreshInvestmentData } = useOrbit();
  // Polling preserves the last successful data. Do not insert an in-flow
  // banner every time it runs: that moves the page underneath the reader.
  if (!investmentDataError) return null;
  return <div role="alert" className="rounded-xl border border-orbit-border p-3 text-sm text-orbit-white flex flex-wrap items-center gap-3">
    <p className="flex-1 min-w-0">{investmentDataError}</p>
    {investmentDataError && <button type="button" disabled={investmentDataLoading} onClick={() => void refreshInvestmentData()} className="min-h-11 px-4 text-orbit-accent disabled:opacity-50">{investmentDataLoading ? "Refreshing…" : "Retry"}</button>}
  </div>;
}
