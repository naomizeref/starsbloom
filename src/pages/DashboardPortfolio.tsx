import { CopyPositions } from "../components/CopyPositions";
import { InvestmentDataStatus } from "../components/InvestmentDataStatus";
import React, { useMemo } from "react";
import { useOrbit } from "../context/OrbitContext";
import { TrendingUp, Award, Layers, Sparkles, PieChart, Info, ShieldAlert, Briefcase, Target, Users, Wallet } from "lucide-react";

interface DashboardPortfolioProps {
  onNavigate: (view: string) => void;
}

export const DashboardPortfolio: React.FC<DashboardPortfolioProps> = ({ onNavigate }) => {
  const { user } = useOrbit();

  const stats = useMemo(() => {
    const totalHoldingValue = user.portfolioValue;
    // Running OR matured-but-unclaimed both stay in the "active" list so the
    // Claim Payout action is visible on the position card. Only trades whose
    // payout has actually been claimed (payoutCompleted) move to history.
    const activeCopyTrades = user.copyTrades.filter(trade => trade.status === "Running" || (trade.status === "Completed" && !trade.payoutCompleted));
    const completedCopyTrades = user.copyTrades.filter(trade => trade.status === "Completed" && trade.payoutCompleted);

    // Let's compute individual asset percentages
    const preProcessedPortfolio = user.portfolio.map(asset => {
      const totalAssetMarketVal = asset.amount * asset.currentPrice;
      const totalCostValue = asset.amount * asset.avgBuyPrice;
      const profitLossVal = +(totalAssetMarketVal - totalCostValue).toFixed(2);
      const profitLossPercent = totalCostValue > 0 ? +((profitLossVal / totalCostValue) * 100).toFixed(2) : 0;
      const weightPercent = totalHoldingValue > 0 ? +((totalAssetMarketVal / totalHoldingValue) * 100).toFixed(1) : 0;

      return {
        ...asset,
        marketValue: totalAssetMarketVal,
        costBasis: totalCostValue,
        profitLoss: profitLossVal,
        profitLossPct: profitLossPercent,
        weight: weightPercent
      };
    });

    // Calculate cumulative stats
    const aggregateCost = preProcessedPortfolio.reduce((acc, cur) => acc + cur.costBasis, 0);
    const aggregatePnL = +(totalHoldingValue - aggregateCost).toFixed(2);
    const aggregatePnLPct = aggregateCost > 0 ? +((aggregatePnL / aggregateCost) * 100).toFixed(2) : 0;

    // Fix Total Equity to include user's actual balance and active investments
    const runningInvestments = user.activeInvestments.filter(item => item.status !== "cancelled" && !item.payoutTransactionId && !item.payoutCompleted);
    const activePlanCapital = runningInvestments.reduce((acc, current) => acc + current.amount, 0);
    const activePlanProfits = runningInvestments.reduce((acc, current) => acc + current.accumulatedProfit, 0);
    const activeCopyCapital = activeCopyTrades.reduce((acc, current) => acc + current.amountInvested, 0);
    const activeCopyExpectedProfit = activeCopyTrades.reduce((acc, current) => acc + current.expectedProfit, 0);
    const totalEquity = +(user.balance + totalHoldingValue + activePlanCapital + activePlanProfits + activeCopyCapital + activeCopyExpectedProfit).toFixed(2);
    
    return {
      totalHoldingValue,
      activeCopyTrades,
      completedCopyTrades,
      preProcessedPortfolio,
      aggregateCost,
      aggregatePnL,
      aggregatePnLPct,
      totalEquity
    };
  }, [user]);

  const {
    totalHoldingValue,
    activeCopyTrades,
    completedCopyTrades,
    preProcessedPortfolio,
    aggregateCost,
    aggregatePnL,
    aggregatePnLPct,
    totalEquity
  } = stats;

  return (
    <div className="space-y-4 pb-4 sm:pb-6 font-sans">
      <InvestmentDataStatus />
      
      {/* Header Info */}
      <div className="border-b border-orbit-border/50 pb-6">
        <h1 className="text-xl font-black font-heading text-white tracking-tight flex items-center gap-2">
          <Briefcase size={24} className="text-orbit-accent shrink-0" />
          <span>Portfolio Overview</span>
        </h1>
        <p className="text-xs text-slate-300 mt-1 font-sans">
          Track your balances, active positions, and copy trading performance. Asset values use the latest available quotes or stored prices when quotes are unavailable.
        </p>
      </div>

      {/* Aggregate metrics box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
        <div className="bg-orbit-card border border-orbit-border rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-[10px] text-slate-300 font-subheading font-semibold">
            <span>Total Equity</span>
            <Wallet size={14} className="text-slate-400 shrink-0" />
          </div>
          <strong className="text-2xl font-black font-data text-white block">${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>

        <div className="bg-orbit-card border border-orbit-border rounded-xl p-6 space-y-2">
          <div className="flex justify-between items-center text-[10px] text-slate-300 font-subheading font-semibold">
            <span>Asset Value</span>
            <Layers size={14} className="text-slate-400 shrink-0" />
          </div>
          <strong className="text-2xl font-black font-data text-orbit-accent block animate-pulse">${totalHoldingValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>

        <div className="bg-orbit-card border border-orbit-border rounded-xl p-6 space-y-2">
          <div className="flex justify-between items-center text-[10px] text-slate-300 font-subheading font-semibold">
            <span>Total PnL</span>
            <TrendingUp size={14} className="text-slate-400 shrink-0" />
          </div>
          <strong className={`text-2xl font-data font-black block ${aggregatePnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {aggregatePnL >= 0 ? "+" : ""}{aggregatePnL.toLocaleString()} ({aggregatePnLPct}%)
          </strong>
        </div>
      </div>

      {/* Main split grid: Radial wheel + list detailing */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch font-sans">
        
        {/* Left column: Visual radial weights wheel (col-span-4) */}
        <div className="lg:col-span-5 bg-orbit-card border border-orbit-border rounded-2xl p-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-heading text-white flex items-center gap-2">
              <PieChart size={16} className="text-orbit-accent" />
              Allocation Weights
            </h3>

            {preProcessedPortfolio.length === 0 ? (
              <p className="text-xs text-center text-slate-300 py-16 font-sans">No asset distribution data available. Fund your account or open a position to view metrics.</p>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 relative space-y-6">
                
                {/* Simulated CSS Radial Stack Gauge */}
                <div className="relative w-40 h-40 rounded-full bg-orbit-darkcard border border-orbit-border flex items-center justify-center shadow-xl">
                  {/* Inside metrics */}
                  <div className="text-center font-sans">
                    <span className="text-[10px] text-slate-300 uppercase tracking-normal font-subheading">Active Assets</span>
                    <strong className="block text-lg font-black font-data text-white">{preProcessedPortfolio.length} Pairs</strong>
                  </div>

                  {/* Gradient rings representing sizes */}
                  <div className="absolute inset-2 border-2 border-dashed border-orbit-accent/30 rounded-full animate-spin" style={{ animationDuration: "35s" }} />
                  <div className="absolute inset-4 border-2 border-dashed border-emerald-500/20 rounded-full animate-spin" style={{ animationDuration: "15s" }} />
                </div>

                {/* Legend checklist */}
                <div className="w-full space-y-2.5 font-sans">
                  {preProcessedPortfolio.map((item, idx) => {
                    const colors = ["#FFA500", "#0ECB81", "#3B82F6", "#8B5CF6", "#EC4899"];
                    const styleCol = colors[idx % colors.length];
                    return (
                      <div key={item.symbol} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: styleCol }} />
                          <span className="font-bold text-white uppercase font-data">{item.symbol}</span>
                          <span className="text-slate-300 font-sans">{item.name}</span>
                        </div>
                        <span className="font-data text-white font-bold">{item.weight}%</span>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </div>

          <div className="pt-4 border-t border-orbit-border/40 text-[10px] text-slate-400 text-center font-sans">
            Prices update in real time.
          </div>
        </div>

        {/* Right column: Tabular details (col-span-8) */}
        <div className="lg:col-span-7 bg-orbit-card border border-orbit-border rounded-2xl p-4 space-y-4">
          <div className="flex justify-between items-center border-b border-orbit-border/50 pb-4">
            <h3 className="text-sm font-bold font-heading text-white flex items-center gap-2">
              <Target size={16} className="text-orbit-accent" />
              <span>Open Positions</span>
            </h3>
            <button 
              onClick={() => onNavigate("dashboard-trading")}
              className="text-xs text-orbit-accent font-subheading hover:underline cursor-pointer"
            >
              Trade Now
            </button>
          </div>

          {preProcessedPortfolio.length === 0 ? (
            <p className="text-xs text-center text-slate-300 py-12 font-sans">No open positions. Start trading to view your portfolio here.</p>
          ) : (
            <div className="space-y-4 font-sans">
              {preProcessedPortfolio.map((holding) => (
                <div 
                  key={holding.symbol}
                  className="p-4 rounded-xl border border-orbit-border bg-orbit-bg/40 flex justify-between items-center text-xs"
                >
                  <div className="space-y-1">
                    <strong className="font-data text-sm text-white">{holding.symbol}</strong>
                    <span className="text-[10px] text-slate-300 block">
                      Quantity: <strong className="font-data text-white">{holding.amount}</strong> | Weight: <span className="font-data text-white font-semibold">{holding.weight}%</span>
                    </span>
                  </div>

                  <div className="space-y-1 font-data text-right">
                    <span className="text-white text-sm font-bold block">
                      ${holding.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className={`text-[10px] font-bold ${holding.profitLoss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {holding.profitLoss >= 0 ? "Profit: +" : "Loss: "}${holding.profitLoss.toLocaleString()} ({holding.profitLossPct}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Copy trading positions */}
      <CopyPositions onNavigate={onNavigate} />

    </div>
  );
};
