import React, { useEffect, useCallback, useState, Suspense, lazy } from "react";
import { MotionConfig } from "motion/react";
import { Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { OrbitProvider } from "./context/OrbitContext";
import { Navigation } from "./components/Navigation";
import { MobileNav } from "./components/MobileNav";
import { Footer } from "./components/Footer";
import { ScrollAnimatedBackground } from "./components/ScrollAnimatedBackground";
import { ChatwayWidget } from "./components/ChatwayWidget";
import { resetBodyScrollLock } from "./hooks/useBodyScrollLock";

import { CLERK_ENABLED } from "./lib/authConfig";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { isPublicEntry, loadAuthPage } from './lib/authPageLoader';

// Pages (Lazy Loaded)
const PublicHome = lazy(() => import("./pages/PublicHome").then(m => ({ default: m.PublicHome })));
const PublicMarkets = lazy(() => import("./pages/PublicMarkets").then(m => ({ default: m.PublicMarkets })));
const PublicCopyTrading = lazy(() => import("./pages/PublicCopyTrading").then(m => ({ default: m.PublicCopyTrading })));
const PublicPlans = lazy(() => import("./pages/PublicPlans").then(m => ({ default: m.PublicPlans })));
const AuthPage = lazy(loadAuthPage);
const DashboardLayout = lazy(() => import('./components/dashboard/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const GlobalModals = lazy(() => import('./components/GlobalModals').then(m => ({ default: m.GlobalModals })));
const ClerkCallback = lazy(() => import("./pages/ClerkAuthPage").then(m => ({ default: m.ClerkCallback })));
const TermsPage = lazy(() => import("./pages/TermsPage").then(m => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then(m => ({ default: m.PrivacyPage })));
const RiskDisclosurePage = lazy(() => import("./pages/RiskDisclosurePage").then(m => ({ default: m.RiskDisclosurePage })));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage").then(m => ({ default: m.MaintenancePage })));
const ParentsPage = lazy(() => import("./pages/ParentsPage").then(m => ({ default: m.ParentsPage })));

// Dashboard (Lazy Loaded)
const DashboardOverview = lazy(() => import("./pages/DashboardOverview").then(m => ({ default: m.DashboardOverview })));
const DashboardTrading = lazy(() => import("./pages/DashboardTrading").then(m => ({ default: m.DashboardTrading })));
const DashboardPortfolio = lazy(() => import("./pages/DashboardPortfolio").then(m => ({ default: m.DashboardPortfolio })));
const DashboardPlans = lazy(() => import("./pages/DashboardPlans").then(m => ({ default: m.DashboardPlans })));
const DashboardWallet = lazy(() => import("./pages/DashboardWallet").then(m => ({ default: m.DashboardWallet })));
const DashboardSupport = lazy(() => import("./pages/DashboardSupport").then(m => ({ default: m.DashboardSupport })));
const DashboardAdmin = lazy(() => import("./pages/DashboardAdmin").then(m => ({ default: m.DashboardAdmin })));
const DashboardTransactions = lazy(() => import("./pages/DashboardTransactions").then(m => ({ default: m.DashboardTransactions })));
const DashboardAirdrops = lazy(() => import("./pages/DashboardAirdrops").then(m => ({ default: m.DashboardAirdrops })));
const DashboardKYC = lazy(() => import("./pages/DashboardKYC").then(m => ({ default: m.DashboardKYC })));
const DashboardWalletFeedback = lazy(() => import("./pages/DashboardWalletFeedback").then(m => ({ default: m.DashboardWalletFeedback })));
const PublicAbout = lazy(() => import("./components/home/AboutUs").then(m => ({ default: m.AboutUs })));
const PublicContact = lazy(() => import("./pages/PublicContact"));
const DashboardSettings = lazy(() => CLERK_ENABLED
  ? import("./pages/ClerkAccountSettings").then(m => ({ default: m.ClerkAccountSettings }))
  : import("./pages/DashboardSettings").then(m => ({ default: m.DashboardSettings })));
const DashboardNotifications = lazy(() => import("./pages/DashboardNotifications").then(m => ({ default: m.DashboardNotifications })));

// Components throughout the app still navigate with the pre-router view
// strings ("dashboard-wallet", "home#about-us", ...) — this maps them onto
// real URLs so those 90+ call sites didn't have to change.
const VIEW_TO_PATH: Record<string, string> = {
  home: "/",
  contact: "/contact",
  "about-us": "/about",
  markets: "/markets",
  "copy-trading": "/copy-trading",
  plans: "/plans",
  auth: "/auth",
  login: "/login",
  register: "/register",
  terms: "/terms",
  privacy: "/privacy",
  risk: "/risk",
  parents: "/parents",
  parenting: "/parents",
  dashboard: "/dashboard",
  "dashboard-trading": "/dashboard/trading",
  "dashboard-portfolio": "/dashboard/portfolio",
  "dashboard-plans": "/dashboard/plans",
  "dashboard-wallet": "/dashboard/wallet",
  "dashboard-support": "/dashboard/support",
  "dashboard-transactions": "/dashboard/transactions",
  "dashboard-airdrops": "/dashboard/airdrops",
  "dashboard-kyc": "/dashboard/kyc",
  "dashboard-wallet-feedback": "/dashboard/wallet-feedback",
  "dashboard-settings": "/dashboard/settings",
  "dashboard-notifications": "/dashboard/notifications",
  "dashboard-admin": "/admin",
};

// Reverse map, used to hand Navigation/MobileNav the view string their
// active-link highlighting still expects.
const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH)
    .filter(([, path]) => !path.includes("#"))
    .map(([view, path]) => [path, view])
);

// Deep links from the pre-router era used hashes (/#markets, /#/admin) —
// rewrite them onto the current routes, including the former home sections.
const LEGACY_HASH_TO_PATH: Record<string, string> = {
  "#home": "/", "#/home": "/",
  "#about-us": "/about", "#contact": "/contact",
  "#markets": "/markets", "#/markets": "/markets",
  "#plans": "/plans", "#/plans": "/plans",
  "#copy-trading": "/copy-trading", "#/copy-trading": "/copy-trading",
  "#auth": "/auth", "#/auth": "/auth",
  "#login": "/login", "#/login": "/login",
  "#register": "/register", "#/register": "/register",
  "#admin": "/admin", "#/admin": "/admin",
};

const WALLET_TABS = ["deposit", "withdraw", "ledger"] as const;
type WalletTab = (typeof WALLET_TABS)[number];
type NavigateFn = (view: string, assetSymbol?: string, subTab?: WalletTab) => void;

// The animated background is purely decorative, but third-party scripts
// (chat widgets, browser extensions) sometimes move/remove its DOM nodes, which
// makes React's own removeChild throw during commits and — without a
// boundary — unmount the whole app. If it crashes, just drop it.
class DecorativeErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const RouteSpinner = () => (
  <div className="flex h-[70vh] items-center justify-center">
    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orbit-accent"></div>
  </div>
);

function TradingRoute({ onNavigate }: { onNavigate: NavigateFn }) {
  const [searchParams] = useSearchParams();
  const asset = searchParams.get("asset") || undefined;
  return <DashboardTrading key={asset || "default"} initialAsset={asset} onNavigate={onNavigate} />;
}

function WalletRoute() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") || "";
  // Support moved to its own page (/dashboard/support) — redirect old
  // ?tab=support deep links (notifications, bookmarks) there.
  if (tabParam === "support") {
    return <Navigate to="/dashboard/support" replace />;
  }
  const tab: WalletTab = (WALLET_TABS as readonly string[]).includes(tabParam)
    ? (tabParam as WalletTab)
    : "deposit";
  return <DashboardWallet key={tab} initialOpenTab={tab} />;
}

function AppShell() {
  // Identity & role come entirely from Clerk (signed-in state) + Supabase
  // (role) — the single source of truth for the route guards below.
  const { isLoggedIn, isAdmin, isReady } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const localDev = import.meta.env.VITE_LOCAL_DEV === "true";
  const maintenanceMode = !localDev && import.meta.env.VITE_MAINTENANCE_MODE === "true";

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);



  // Break out of any parent iframe to prevent duplicate app nesting
  useEffect(() => {
    if (window.top && window.top !== window) {
      try {
        window.top.location.href = window.location.href;
      } catch (e) {
        // cross-origin protection fallback
      }
    }
  }, [location.pathname]);

  // Rewrite legacy hash deep-links onto real routes.
  useEffect(() => {
    const legacyPath = LEGACY_HASH_TO_PATH[location.hash];
    if (location.pathname === "/" && legacyPath && legacyPath !== "/") {
      navigate(legacyPath, { replace: true });
    }
  }, [location.pathname, location.hash, navigate]);

  // Scroll to the anchor when a hash is present (retrying briefly while the
  // lazy page chunk mounts), otherwise reset to the top on every navigation.
  useEffect(() => {
    resetBodyScrollLock();
    const hash = location.hash;
    if (hash && !LEGACY_HASH_TO_PATH[hash]) {
      let attempts = 0;
      const timer = window.setInterval(() => {
        const el = document.getElementById(hash.slice(1));
        attempts += 1;
        if (el) el.scrollIntoView({ behavior: "smooth" });
        if (el || attempts >= 20) window.clearInterval(timer);
      }, 100);
      return () => window.clearInterval(timer);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [location.key, location.pathname]);

  const handleNavigate = useCallback<NavigateFn>((view, assetSymbol, subTab) => {
    // Deliberately NOT gated on isReady: the moment the admin role is known,
    // every navigation lands on /admin. Previously a sign-in that completed
    // while the profile was still loading fell through to /dashboard first,
    // bouncing admins through the user site before the pin corrected it.
    // (The render-time pin below still enforces /admin once fully ready.)
    if (isLoggedIn && isAdmin) {
      navigate("/admin");
      return;
    }

    if (["home#about-us", "home#contact"].includes(view)) {
      navigate(view.endsWith("contact") ? "/contact" : "/about");
      return;
    }
    if (view.includes("#")) {
      const anchor = view.split("#")[1];
      navigate(anchor ? `/#${anchor}` : "/");
      return;
    }

    if (view === "dashboard-referral") {
      navigate("/dashboard");
      return;
    }
    if (view === "dashboard-trading" && assetSymbol) {
      navigate(`/dashboard/trading?asset=${encodeURIComponent(assetSymbol)}`);
      return;
    }
    if (view === "dashboard-wallet" && subTab) {
      navigate(`/dashboard/wallet?tab=${subTab}`);
      return;
    }

    navigate(VIEW_TO_PATH[view] ?? "/");
  }, [navigate, isLoggedIn, isAdmin]);

  if (maintenanceMode) {
    return (
      <div className="relative flex min-h-svh flex-col bg-orbit-bg text-[#F5F6F8] font-sans">
        <DecorativeErrorBoundary>
        <ScrollAnimatedBackground />
      </DecorativeErrorBoundary>
        <main className="relative z-10 flex-1 w-full">
          <Suspense fallback={<RouteSpinner />}>
            <MaintenancePage />
          </Suspense>
        </main>
      </div>
    );
  }

  // Hold rendering until Clerk's session AND the Supabase role are both
  // known. This is the fix for the refresh flash: without it, a signed-in
  // user briefly saw the public home page (and an admin additionally
  // flashed through the user dashboard) before the redirect effects fired.
  if (!isReady && (isLoggedIn || !isPublicEntry(location.pathname))) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-orbit-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orbit-accent"></div>
      </div>
    );
  }

  const isAdminUser = isLoggedIn && isAdmin;
  const isAuthenticatedUser = isLoggedIn && !isAdmin;

  // Admins only ever see the admin dashboard (pre-router behavior, kept).
  if (isAdminUser && location.pathname !== "/admin") {
    return <Navigate to="/admin" replace />;
  }

  const currentView = PATH_TO_VIEW[location.pathname] ?? "home";
  const showUserNavigation = !isAdminUser && currentView !== "home";
  const showUserMobileNav = isAuthenticatedUser && currentView !== "auth";

  const guestOnly = (element: React.ReactElement) =>
    isLoggedIn ? <Navigate to="/dashboard" replace /> : element;
  const userOnly = (element: React.ReactElement) =>
    isLoggedIn ? element : <Navigate to="/auth" replace />;

  const withDashboardLayout = (element: React.ReactElement) => (
    <DashboardLayout
      currentView={currentView}
      onNavigate={handleNavigate}
      onOpenDeposit={() => setDepositModalOpen(true)}
      onOpenWithdraw={() => setWithdrawModalOpen(true)}
    >
      {element}
    </DashboardLayout>
  );

  const userDashboardRoute = (element: React.ReactElement) =>
    userOnly(withDashboardLayout(element));

  const dashboardOverview = (
    <DashboardOverview
      onNavigate={handleNavigate}
      onOpenDeposit={() => setDepositModalOpen(true)}
      onOpenWithdraw={() => setWithdrawModalOpen(true)}
    />
  );

  return (
    <div className="relative flex min-h-svh flex-col bg-orbit-bg text-[#F5F6F8] font-sans">
      <DecorativeErrorBoundary>
        <ScrollAnimatedBackground />
      </DecorativeErrorBoundary>

      {/* Global Navigation Bar */}
      {showUserNavigation && (
        <Navigation currentView={currentView} onNavigate={handleNavigate} />
      )}

      {/* Primary content area container */}
      <main className={`relative z-10 flex-1 w-full ${
        isAdminUser
          ? ""
          : currentView === "home"
            ? "p-0 m-0 overflow-hidden"
            : (currentView === "auth" || currentView === "login" || currentView === "register")
              ? "flex items-center justify-center min-h-[calc(100svh-5rem)] px-3 sm:px-6 pt-20 sm:pt-24 pb-8"
              : "max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 pt-20 sm:pt-24 pb-20 sm:pb-24"
      }`}>
        <Suspense fallback={<RouteSpinner />}>
          <Routes>
            <Route path="/" element={guestOnly(<PublicHome onNavigate={handleNavigate} />)} />
            <Route path="/about" element={<PublicAbout />} />
            <Route path="/contact" element={<PublicContact />} />
            <Route path="/markets" element={guestOnly(<PublicMarkets onNavigate={handleNavigate} />)} />
            <Route path="/plans" element={guestOnly(<PublicPlans onNavigate={handleNavigate} />)} />
            <Route path="/copy-trading" element={<PublicCopyTrading onNavigate={handleNavigate} />} />
            {CLERK_ENABLED && <Route path="/sso-callback" element={<ClerkCallback />} />}
            <Route path="/auth" element={guestOnly(<AuthPage onNavigate={handleNavigate} />)} />
            <Route path="/login" element={guestOnly(<AuthPage onNavigate={handleNavigate} initialTab="login" />)} />
            <Route path="/register" element={guestOnly(<AuthPage onNavigate={handleNavigate} initialTab="register" />)} />
            <Route path="/terms" element={<TermsPage onNavigate={handleNavigate} />} />
            <Route path="/privacy" element={<PrivacyPage onNavigate={handleNavigate} />} />
            <Route path="/risk" element={<RiskDisclosurePage onNavigate={handleNavigate} />} />
            <Route path="/parents" element={<ParentsPage onNavigate={handleNavigate} />} />
            <Route path="/parenting" element={<ParentsPage onNavigate={handleNavigate} />} />

            <Route path="/dashboard" element={userDashboardRoute(dashboardOverview)} />
            <Route path="/dashboard/trading" element={userDashboardRoute(<TradingRoute onNavigate={handleNavigate} />)} />
            <Route path="/dashboard/portfolio" element={userDashboardRoute(<DashboardPortfolio onNavigate={handleNavigate} />)} />
            <Route path="/dashboard/plans" element={userDashboardRoute(<DashboardPlans />)} />
            <Route path="/dashboard/wallet" element={userDashboardRoute(<WalletRoute />)} />
            <Route path="/dashboard/support" element={userDashboardRoute(<DashboardSupport />)} />
            <Route path="/dashboard/transactions" element={userDashboardRoute(<DashboardTransactions />)} />
            <Route path="/dashboard/airdrops" element={userDashboardRoute(<DashboardAirdrops />)} />
            <Route path="/dashboard/kyc" element={userDashboardRoute(<DashboardKYC />)} />
            <Route path="/dashboard/wallet-feedback" element={userDashboardRoute(<DashboardWalletFeedback />)} />
            <Route path="/dashboard/settings" element={userDashboardRoute(<DashboardSettings />)} />
            <Route path="/dashboard/notifications" element={userDashboardRoute(<DashboardNotifications onNavigate={handleNavigate} />)} />

            <Route
              path="/admin"
              element={
                !isLoggedIn
                  ? <Navigate to="/auth" replace />
                  : isAdmin
                    ? <DashboardAdmin />
                    : <Navigate to="/dashboard" replace />
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Global Standard Footer - Hidden on mobile and auth/login/register/parents pages */}
      {!isAdminUser && currentView !== "auth" && currentView !== "login" && currentView !== "register" && currentView !== "parents" && currentView !== "parenting" && (
        <div className="hidden sm:block">
          <Footer onNavigate={handleNavigate} />
        </div>
      )}

      {/* Mobile Sticky Navigation (Logged in users only) */}
      {showUserMobileNav && (
        <div className="sm:hidden mt-auto z-40 relative">
          <MobileNav currentView={currentView} onNavigate={handleNavigate} />
        </div>
      )}

      {/* Chatway Live Chat integration */}
      <ChatwayWidget />

      {isLoggedIn && <Suspense fallback={null}><GlobalModals
        depositModalOpen={depositModalOpen}
        setDepositModalOpen={setDepositModalOpen}
        withdrawModalOpen={withdrawModalOpen}
        setWithdrawModalOpen={setWithdrawModalOpen}
        onNavigate={handleNavigate}
      /></Suspense>}
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  if (!CLERK_ENABLED && window.location.pathname === "/sso-callback") {
    window.location.replace("/dashboard");
    return null;
  }

  return (
    <OrbitProvider loadPublicCatalogs={!isPublicEntry(pathname)}>
      <MotionConfig reducedMotion="always">
        <AppShell />
      </MotionConfig>
    </OrbitProvider>
  );
}
