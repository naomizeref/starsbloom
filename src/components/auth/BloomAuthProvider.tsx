import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ClerkProvider, RedirectToTasks, useClerk, useSession } from "@clerk/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { BloomIdentityContext } from "../../context/BloomIdentityContext";
import { installClerkRuntime } from "../../lib/authRuntime";
import { CLERK_ENABLED } from "../../lib/authConfig";
import { isPublicEntry } from '../../lib/authPageLoader';

function ClerkIdentity({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { isLoaded, session } = useSession();
  const clerk = useClerk();
  const [account, setAccount] = useState<{ sessionId: string; user: User } | null>(null);
  const [failure, setFailure] = useState<{ sessionId: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [startupSlow, setStartupSlow] = useState(false);
  const sessionId = session?.id;
  const user = account && account.sessionId === sessionId ? account.user : null;

  useEffect(() => {
    if (isLoaded) { setStartupSlow(false); return; }
    const timer = setTimeout(() => setStartupSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useLayoutEffect(() => installClerkRuntime({ user,
    getToken: async () => session?.getToken() ?? null,
    signOut: async () => { await clerk.signOut(); },
  }), [session, clerk, user]);

  useEffect(() => {
    if (!isLoaded || !session || session.currentTask) { setAccount(null); setFailure(null); return; }
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setFailure({ sessionId: session.id, message: 'Opening your account took too long. Please try again.' });
    }, 20000);
    setFailure(null);
    void (async () => {
      try {
        const token = await session.getToken();
        if (!active) return;
        if (!token) throw new Error("Your session has expired. Please sign in again.");
        const response = await fetch("/api/clerk-session", { method: "POST", signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.user?.id) throw new Error(result?.error || "Unable to open your Bloom account. Please try again.");
        if (active) setAccount({ sessionId: session.id, user: result.user });
      } catch (error) {
        if (active) setFailure({ sessionId: session.id, message: controller.signal.aborted
          ? "Opening your account took too long. Please try again." : (error as Error).message });
      } finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [isLoaded, sessionId, session?.currentTask?.key, retry]);

  const identity = useMemo(() => ({ user, session: null, authLoaded: isLoaded, sessionKey: sessionId || "signed-out" }), [user, sessionId, isLoaded]);
  if (session?.currentTask) return <RedirectToTasks />;
  if (sessionId && failure?.sessionId === sessionId) return <main className="min-h-svh flex items-center justify-center bg-orbit-bg px-5 text-orbit-white">
    <section className="w-full max-w-md rounded-2xl border border-orbit-border bg-orbit-card p-6 space-y-5">
      <h1 className="text-xl font-semibold">Open your Bloom account</h1>
      <p role="alert" className="text-sm text-orbit-gray-text">{failure.message}</p>
      <button className="min-h-11 rounded-xl bg-orbit-accent px-5" onClick={() => setRetry(value => value + 1)}>Try again</button>
      <button className="ml-4 min-h-11 underline" onClick={() => void clerk.signOut()}>Sign out</button>
    </section>
  </main>;
  // Guests can start filling the public form while Clerk connects. Known
  // sessions, private routes and provisioning still wait behind this gate.
  if ((!isLoaded && (session || !isPublicEntry(pathname))) || (session && !user)) return <main className="min-h-svh flex flex-col gap-4 items-center justify-center bg-orbit-bg text-orbit-white px-5">
    {!isLoaded && startupSlow ? <>
      <p role="alert">Sign-in is taking longer than expected. Please retry.</p>
      <button className="orb-button" onClick={() => window.location.reload()}>Reload page</button>
      <a href="/" className="underline">Back to home</a>
    </> : <p role="status">Opening Bloom…</p>}
  </main>;
  // Remount private caches on identity changes; late responses from the old account cannot leak.
  return <BloomIdentityContext.Provider value={identity}><React.Fragment key={sessionId || "signed-out"}>{children}</React.Fragment></BloomIdentityContext.Provider>;
}

export function BloomAuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  if (!CLERK_ENABLED) return <>{children}</>;
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key) return <main className="min-h-svh grid place-items-center bg-orbit-bg text-orbit-white p-6" role="alert">Sign-in is temporarily unavailable. Please contact support.</main>;
  return <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/register"
    signInFallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard" afterSignOutUrl="/login"
    routerPush={to => navigate(to)} routerReplace={to => navigate(to, { replace: true })}
    appearance={{ variables: { colorPrimary: "#2864f0", colorBackground: "#11131a", colorForeground: "#f5f6f8",
      fontSize: "16px", borderRadius: "0.75rem" } }}>
    <ClerkIdentity>{children}</ClerkIdentity>
  </ClerkProvider>;
}
