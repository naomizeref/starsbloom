import { signOutBloom } from "../lib/authRuntime";
import React, { useState } from "react";
import { useOrbit } from "../context/OrbitContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useSupabaseClient } from "../lib/supabase";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { Menu, X, User, LogOut, LayoutDashboard, Coins, Briefcase, Wallet2, TrendingUp, LogIn, UserPlus, History, Gift, Shield, CheckCircle2, ChevronDown, MoreHorizontal, MessageSquare, Settings, Bell } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface NavigationProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onNavigate }) => {
  const { user, unreadNotificationsCount } = useOrbit();
  const { isLoggedIn, isAdmin } = useCurrentUser();
  const supabase = useSupabaseClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  useBodyScrollLock(mobileMenuOpen);

  if (isLoggedIn && isAdmin) return null;

  const handleSignOut = async () => {
    await signOutBloom(supabase);
    onNavigate("home");
  };

  const guestLinks = [
    { id: "home", label: "Home" },
    { id: "markets", label: "Markets" },
    { id: "plans", label: "Earn" },
    { id: "about-us", label: "About" },
    { id: "contact", label: "Contact" }
  ];

  const primaryLinks = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="text-blue-400" size={14} /> },
    { id: "dashboard-trading", label: "Trade", icon: <TrendingUp className="text-emerald-400" size={14} /> },
    { id: "dashboard-wallet", label: "Wallet", icon: <Wallet2 className="text-cyan-400" size={14} /> },
    { id: "dashboard-plans", label: "Investments", icon: <Briefcase className="text-amber-400" size={14} /> },
    { id: "dashboard-transactions", label: "History", icon: <History className="text-gray-400" size={14} /> }
  ];

  const secondaryLinks = [
    { id: "copy-trading", label: "Copy Trading", icon: <User className="text-violet-400" size={14} /> },
    { id: "dashboard-airdrops", label: "Airdrops", icon: <Gift className="text-rose-400" size={14} /> },
    { id: "dashboard-wallet-feedback", label: "Wallet Requests", icon: <Wallet2 className="text-pink-400" size={14} /> },
    { id: "dashboard-kyc", label: user.kyc?.status === "approved" ? "Verified" : "Verify Identity", icon: user.kyc?.status === "approved" ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Shield size={14} className="text-amber-400" /> },
    { id: "dashboard-notifications", label: "Notifications", icon: <Bell className="text-orbit-accent" size={14} />, badge: unreadNotificationsCount },
    { id: "dashboard-support", label: "Support", icon: <MessageSquare className="text-sky-400" size={14} /> },
    { id: "dashboard-settings", label: "Settings", icon: <Settings className="text-slate-400" size={14} /> }
  ];

  const getUID = (email: string | null) => {
    if (!email) return "0000000";
    // Stable numeric UID derived from email hash (7 digits)
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = (email.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    const uid = Math.abs(hash) % 10000000;
    return String(uid).padStart(7, "0");
  };

  const handleAuthenticatedNav = (id: string) => {
    onNavigate(id);
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  };

  const isLinkActive = (id: string) => {
    if (id === "home") {
      return currentView === "home" || currentView === "";
    }
    return currentView === id;
  };

  return (
    <>
      <nav role="navigation" aria-label="Main navigation" className="fixed top-0 left-0 right-0 w-full h-16 sm:h-20 bg-[#07090E] sm:bg-[#07090E]/95 sm:backdrop-blur-md border-b border-orbit-border/80 z-50 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 lg:py-4 flex items-center justify-between">

          {/* Left section: Brand Logo */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => onNavigate(isLoggedIn ? "dashboard" : "home")}
              className="flex items-center cursor-pointer group"
            >
              <img
                src="/bloom-logo-white.svg"
                alt="Bloom"
                className="h-8 sm:h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          </div>

          {/* Desktop Links (Public + Live states) */}
          <div className="hidden lg:flex items-center gap-6 text-xs text-orbit-gray-text font-medium">
            {!isLoggedIn ? (
              <>
                <div className="flex gap-1.5 border-r border-orbit-border/50 pr-6">
                  {guestLinks.map((link) => (
                    <button
                      key={link.id}
                      onClick={() => {
                        if (link.id === "about-us" || link.id === "contact") {
                          onNavigate("home#" + link.id);
                        } else {
                          onNavigate(link.id);
                        }
                        setMobileMenuOpen(false);
                      }}
                      className={`px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${isLinkActive(link.id)
                          ? "text-orbit-accent bg-orbit-accent/10 font-bold shadow-inner shadow-orbit-accent/10"
                          : "hover:text-orbit-white hover:bg-white/5"
                        }`}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'instant' });
                      onNavigate("login");
                    }}
                    className="px-4 py-2 hover:text-orbit-white transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'instant' });
                      onNavigate("register");
                    }}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orbit-accent to-[#1D4ED8] text-white font-bold shadow-md shadow-orbit-accent/10 hover:opacity-95 transition-all cursor-pointer"
                  >
                    Register
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Authenticated Desktop Links */}
                <div className="flex items-center gap-1.5 border-r border-orbit-border/50 pr-6">
                  {primaryLinks.map((link) => (
                    <button
                      key={link.id}
                      onClick={() => handleAuthenticatedNav(link.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${isLinkActive(link.id)
                          ? "text-orbit-accent bg-orbit-accent/10 font-bold shadow-inner shadow-orbit-accent/10"
                          : "hover:text-orbit-white hover:bg-white/5"
                        }`}
                    >
                      {link.icon}
                      <span>{link.label}</span>
                    </button>
                  ))}

                  <div className="relative">
                    <button
                      onClick={() => setMoreMenuOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer hover:text-orbit-white hover:bg-white/5"
                    >
                      <MoreHorizontal size={14} />
                      <span>More</span>
                      <ChevronDown size={12} className={`transition-transform ${moreMenuOpen ? "rotate-180" : "rotate-0"}`} />
                    </button>

                    <AnimatePresence>
                      {moreMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16 }}
                          className="absolute right-0 mt-2 w-56 rounded-2xl border border-orbit-border/70 bg-[#0d1118]/95 p-2 shadow-2xl backdrop-blur-xl"
                        >
                          {secondaryLinks.map((link) => (
                            <button
                              key={link.id}
                              onClick={() => handleAuthenticatedNav(link.id)}
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${isLinkActive(link.id)
                                  ? "text-orbit-accent bg-orbit-accent/10"
                                  : "text-orbit-gray-text hover:text-orbit-white hover:bg-white/5"
                                }`}
                            >
                              {link.icon}
                              <span>{link.label}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* User details and exit button */}
                <div className="flex items-center gap-4">
                  {isAdmin && (
                    <button
                      onClick={() => onNavigate("dashboard-admin")}
                      className="py-1.5 px-3 rounded text-[10px] bg-gradient-to-r from-orbit-accent to-[#1D4ED8] text-white font-black uppercase tracking-widest cursor-pointer shadow hover:opacity-95"
                    >
                      Admin
                    </button>
                  )}

                  <div className="flex flex-col text-right">
                    <span className="text-[10px] font-mono text-orbit-white font-bold leading-none">
                      UID: {getUID(user.email)}
                    </span>
                    <span className="text-[9px] text-orbit-gray-text font-mono mt-0.5 truncate max-w-[120px]" title={user.username || user.name || user.email || ""}>
                      {user.username || user.name || user.email}
                    </span>
                  </div>

                  <button
                    onClick={() => { handleSignOut(); }}
                    className="p-1.5 text-orbit-gray-text hover:text-orbit-red transition-all cursor-pointer rounded hover:bg-orbit-red/10 animate-pulse hover:animate-none"
                    title="Sign Out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right Mobile action icon (Bell / User ID / Hamburger Menu) */}
          <div className="lg:hidden flex items-center gap-2">
            {isLoggedIn ? (
              <button
                onClick={() => onNavigate("dashboard-notifications")}
                className="relative p-2 rounded-xl bg-orbit-card border border-orbit-border text-slate-300 hover:text-white cursor-pointer"
                title="Notifications"
              >
                <Bell size={16} />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orbit-accent text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={() => { window.scrollTo({ top: 0, behavior: 'instant' }); onNavigate("login"); }}
                className="px-3 py-1.5 rounded-lg bg-orbit-accent text-white font-bold text-xs uppercase cursor-pointer"
              >
                Sign In
              </button>
            )}

            {/* Standard Mobile Hamburger Menu at Top-Right Corner */}
            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-orbit-card border border-orbit-border text-white hover:bg-orbit-accent/15 hover:border-orbit-accent cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              {mobileMenuOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-orbit-accent" />}
            </button>
          </div>

        </div>
      </nav>

      {/* Mobile drop-down drawer overlay (Slide from Left for standard Android feel) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            role="navigation"
            aria-label="Mobile navigation"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="lg:hidden fixed inset-0 bg-[#07090E] z-[100] overflow-y-auto overscroll-contain px-5 py-5 flex flex-col pb-24 shadow-2xl border-r border-orbit-border/40"
          >

            <div className="flex flex-col space-y-6 min-h-full">
              {/* Mobile Header Bar inside overlay */}
              <div className="flex items-center justify-between border-b border-orbit-border/50 pb-4 shrink-0">
                {/* Brand Logo */}
                <div
                  onClick={() => { onNavigate(isLoggedIn ? "dashboard" : "home"); setMobileMenuOpen(false); }}
                  className="flex items-center cursor-pointer group"
                >
                  <img
                    src="/bloom-logo-white.svg"
                    alt="Bloom"
                    className="h-8 w-auto object-contain"
                  />
                </div>

                <button
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 bg-orbit-card/50 rounded-xl border border-orbit-border/50 text-orbit-gray-text hover:text-orbit-white cursor-pointer focus:outline-none transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Dynamic Navigation Menu Items inside list */}
              <div className="flex flex-col space-y-1 flex-1">
                {!isLoggedIn ? (
                  // Guest Menu Items: Home, Markets, Earn, About, Contact
                  <>
                    {guestLinks.map((link) => (
                      <button
                        key={link.id}
                        onClick={() => {
                          if (link.id === "about-us" || link.id === "contact") {
                            onNavigate("home#" + link.id);
                          } else {
                            onNavigate(link.id);
                          }
                          setMobileMenuOpen(false);
                        }}
                        className={`py-3.5 px-4 rounded-xl text-left text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${isLinkActive(link.id)
                            ? "text-orbit-accent bg-orbit-accent/10 border-l-[3px] border-orbit-accent font-bold pl-4 shadow-inner"
                            : "text-orbit-gray-text hover:text-orbit-white hover:bg-orbit-card/40"
                          }`}
                      >
                        <span>{link.label}</span>
                      </button>
                    ))}

                    {/* Spacer to push auth buttons down */}
                    <div className="mt-auto pt-6 pb-2" />

                    {/* Divider */}
                    <div className="w-full h-[1px] bg-neutral-900/60 mb-6" />

                    {/* Auth Buttons */}
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'instant' });
                          onNavigate("login");
                          setMobileMenuOpen(false);
                        }}
                        className="w-full py-3.5 rounded-xl border border-orbit-border text-center text-xs font-bold font-subheading text-orbit-white hover:bg-orbit-card/80 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <LogIn size={14} /> Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'instant' });
                          onNavigate("register");
                          setMobileMenuOpen(false);
                        }}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orbit-accent to-[#1D4ED8] text-white font-bold text-center text-xs font-subheading hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-orbit-accent/20"
                      >
                        <UserPlus size={14} /> Register
                      </button>
                    </div>
                  </>
                ) : (
                  // Authenticated Menu Items: Dashboard, Trade, Copy Trading, Assets, Deposit / Withdraw, Earn
                  <>
                    <div className="space-y-1 pr-2 pb-6">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-orbit-gray-text/80">Primary</div>
                      {primaryLinks.map((link) => (
                        <button
                          key={link.id}
                          onClick={() => handleAuthenticatedNav(link.id)}
                          className={`w-full py-3.5 px-4 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-3.5 cursor-pointer ${isLinkActive(link.id)
                              ? "text-orbit-accent bg-orbit-accent/10 border-l-[3px] border-orbit-accent font-bold pl-3.5 shadow-inner"
                              : "text-orbit-gray-text hover:text-orbit-white hover:bg-orbit-card/40"
                            }`}
                        >
                          <span className={isLinkActive(link.id) ? "text-orbit-accent" : "text-orbit-gray-text"}>
                            {link.icon}
                          </span>
                          <span>{link.label}</span>
                        </button>
                      ))}

                      <div className="mt-4 mb-2 text-[10px] uppercase tracking-[0.3em] text-orbit-gray-text/80">More</div>
                      {secondaryLinks.map((link) => (
                        <button
                          key={link.id}
                          onClick={() => handleAuthenticatedNav(link.id)}
                          className={`w-full py-3.5 px-4 rounded-xl text-left text-sm font-medium transition-all flex items-center gap-3.5 cursor-pointer ${isLinkActive(link.id)
                              ? "text-orbit-accent bg-orbit-accent/10 border-l-[3px] border-orbit-accent font-bold pl-3.5 shadow-inner"
                              : "text-orbit-gray-text hover:text-orbit-white hover:bg-orbit-card/40"
                            }`}
                        >
                          <span className={isLinkActive(link.id) ? "text-orbit-accent" : "text-orbit-gray-text"}>
                            {link.icon}
                          </span>
                          <span>{link.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Authenticated User Profile & Sign Out - Integrated Flow */}
                    <div className="mt-auto pt-2">
                      <div className="w-full h-[1px] bg-neutral-900/60 mb-4" />
                      <div className="flex flex-col gap-4 px-2">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-orbit-card/30 border border-orbit-border/40">
                          <div className="flex flex-col text-left">
                            <span className="text-[11px] font-bold text-orbit-white font-mono tracking-wide">
                              UID: {getUID(user.email)}
                            </span>
                            <span className="text-[10px] text-orbit-gray-text font-sans truncate max-w-[180px] mt-0.5" title={user.username || user.name || user.email || ""}>
                              {user.username || user.name || user.email}
                            </span>
                          </div>

                          {isAdmin && (
                            <button
                              onClick={() => { onNavigate("dashboard-admin"); setMobileMenuOpen(false); }}
                              className="py-1 px-2.5 rounded text-[9px] bg-gradient-to-r from-orbit-accent to-[#1D4ED8] text-white font-black uppercase tracking-widest cursor-pointer shadow shrink-0"
                            >
                              Admin
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => { handleSignOut(); setMobileMenuOpen(false); }}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-orbit-red/30 bg-orbit-red/5 text-orbit-red text-sm font-bold font-subheading hover:bg-orbit-red/10 transition-all cursor-pointer shadow-sm shadow-orbit-red/5"
                        >
                          <LogOut size={16} /> Sign Out Securely
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
