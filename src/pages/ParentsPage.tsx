import React, { useEffect, useRef, useCallback } from "react";
import { useSeo } from "../lib/useSeo";

interface ParentsPageProps {
  onNavigate: (view: string) => void;
}

export const ParentsPage: React.FC<ParentsPageProps> = ({ onNavigate }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useSeo({
    title: "Parents Portal — Bloom",
    description: "Bloom's parental controls, financial education, and safety features for teen investing.",
    path: "/parents",
  });

  const handleNavigateToLogin = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    onNavigate("login");
  }, [onNavigate]);

  useEffect(() => {
    // Listen for postMessage from proxy bridge script or embedded window
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== window.location.origin) return;
      const data = event.data;
      if (
        data === "get-started" ||
        data === "login" ||
        data?.type === "NAVIGATE_TO_LOGIN" ||
        data?.type === "PARENT_GET_STARTED" ||
        (typeof data === "string" && (data.toLowerCase().includes("get-started") || data.toLowerCase().includes("login")))
      ) {
        handleNavigateToLogin();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleNavigateToLogin]);

  // Direct DOM interception on iframe load & continuous mutation monitoring
  const handleIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      const win = iframeRef.current?.contentWindow;
      if (!doc) return;

      const interceptClicks = (e: Event) => {
        let el = e.target as HTMLElement | null;
        while (el && el !== doc.body && el !== doc.documentElement) {
          const tag = (el.tagName || "").toUpperCase();
          const isButton = tag === "BUTTON" || (tag === "INPUT" && ["submit", "button", "image"].includes((el as HTMLInputElement).type));
          const isLink = tag === "A" || el.getAttribute("role") === "button" || el.getAttribute("role") === "link";
          const text = (el.innerText || el.textContent || (el as HTMLInputElement).value || "").toLowerCase().trim();

          if (
            isButton ||
            isLink ||
            text.includes("get started") ||
            text.includes("start") ||
            text.includes("sign up") ||
            text.includes("signup") ||
            text.includes("login") ||
            text.includes("log in") ||
            text.includes("continue") ||
            text.includes("join") ||
            text.includes("register")
          ) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            handleNavigateToLogin();
            return false;
          }
          el = el.parentElement;
        }
      };

      ["click", "mousedown", "pointerdown", "touchstart", "submit"].forEach((evtName) => {
        doc.addEventListener(evtName, interceptClicks, true);
        win?.addEventListener(evtName, interceptClicks, true);
      });

      // Patch all present and future <a> and <button> elements
      const patchElements = () => {
        doc.querySelectorAll("a, button, [role='button'], input[type='submit'], input[type='button']").forEach((el) => {
          if (el.tagName === "A") {
            el.setAttribute("href", "javascript:void(0);");
            el.setAttribute("target", "_self");
          }
        });
      };

      patchElements();
      const observer = new MutationObserver(patchElements);
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    } catch {
      // Cross-origin fallback is fully covered by postMessage bridge and head injection
    }
  };

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen bg-[#F8FAFC] overflow-hidden flex flex-col">
      {/* Persistent top bar: Ensures user can always navigate to login */}
      <header className="w-full h-14 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-6 flex items-center justify-between z-50 shadow-sm shrink-0">
        <button
          onClick={handleNavigateToLogin}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F172A] hover:text-orbit-accent transition-colors"
        >
          <svg className="w-4 h-4 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Login
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleNavigateToLogin}
            className="rounded-xl bg-orbit-accent hover:bg-orbit-accent-hover text-white text-xs sm:text-sm font-semibold px-4 py-2 transition-all shadow-sm shadow-orbit-accent/25"
          >
            Log In
          </button>
        </div>
      </header>

      {/* Embedded page with full-bleed view */}
      <div className="flex-1 w-full h-full relative">
        <iframe
          ref={iframeRef}
          src="/api/parents-proxy"
          title="Bloom Parents Portal"
          className="w-full h-full border-0 block"
          onLoad={handleIframeLoad}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
        />
      </div>
    </div>
  );
};


