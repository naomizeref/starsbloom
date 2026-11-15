import React, { useState } from "react";
import { Share2, Users, Trophy, DollarSign, Copy, Check } from "lucide-react";
import { useOrbit } from "../context/OrbitContext";

export const DashboardReferral: React.FC = () => {
  const { user, withdrawEarnings, addNotification } = useOrbit();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://bloomsinvest.co";
  const referralLink = `${origin}/register?ref=${user.email?.split('@')[0] || 'user'}`;
  
  const referralCount = user.referralCount || 0;
  const points = user.points || 0;
  const earnedBalance = points * 1;
  const progressPercent = Math.min((points / 100) * 100, 100);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(referralLink); }
    catch { addNotification("Could not copy the link. Select and copy it manually."); return; }
    setCopied(true);
    addNotification("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 pb-4 sm:pb-6 font-sans">
      <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
        <Share2 className="text-orbit-accent" size={24} />
        Refer & Earn
      </h2>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-orbit-card border border-orbit-border rounded-xl p-4 flex flex-col items-center">
          <Users className="text-slate-400 mb-1.5" size={20} />
          <p className="text-sm font-bold text-white font-data">{referralCount}</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Referrals</p>
        </div>
        <div className="bg-orbit-card border border-orbit-border rounded-xl p-4 flex flex-col items-center">
          <Trophy className="text-orbit-accent mb-1.5" size={20} />
          <p className="text-sm font-bold text-white font-data">{points}</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Points</p>
        </div>
        <div className="bg-orbit-card border border-orbit-border rounded-xl p-4 flex flex-col items-center">
          <DollarSign className="text-emerald-400 mb-1.5" size={20} />
          <p className="text-sm font-bold text-white font-data">${earnedBalance.toFixed(2)}</p>
          <p className="text-[10px] text-slate-300 mt-0.5">Balance</p>
        </div>
      </div>

      {/* Referral Link Container */}
      <div className="bg-orbit-card border border-orbit-border rounded-xl p-4 space-y-2">
        <p className="text-xs text-slate-300 font-bold">Your Referral Link:</p>
        <div className="bg-orbit-bg border border-orbit-border rounded-lg p-3 flex justify-between items-center text-sm text-slate-300 gap-2">
          <span className="truncate font-mono text-xs text-white">{referralLink}</span>
          <button 
            onClick={handleCopy} 
            className="bg-orbit-accent hover:bg-orbit-accent-hover text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 text-xs shrink-0 cursor-pointer transition-colors shadow-sm"
          >
            {copied ? <Check size={14}/> : <Copy size={14}/>}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Milestone Progress */}
      <div className="bg-orbit-card border border-orbit-border rounded-xl p-4 space-y-3">
        <div className="flex justify-between text-[11px] text-slate-300">
          <span>Payout Threshold</span>
          <span className="font-data font-bold text-white">{points} / 100 Points</span>
        </div>
        <div className="w-full bg-orbit-border/50 h-2 rounded-full overflow-hidden">
          <div className="bg-orbit-accent h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
        </div>
        
        <button 
          onClick={withdrawEarnings}
          disabled={points < 100}
          className={`w-full text-xs font-bold py-3 rounded-lg transition-all cursor-pointer ${
            points < 100 
              ? "bg-orbit-border/50 text-slate-400 cursor-not-allowed border border-orbit-border" 
              : "bg-orbit-accent hover:bg-orbit-accent-hover text-white shadow-sm shadow-orbit-accent/20"
          }`}
        >
          {points < 100 ? "Withdraw to Wallet ($100 Min)" : `Withdraw $${earnedBalance.toFixed(2)} to Wallet`}
        </button>
      </div>
    </div>
  );
};
