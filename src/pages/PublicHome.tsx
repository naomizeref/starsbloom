import React, { useRef, useCallback } from "react";

export const PublicHome: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Patch all CTA and navigation links inside the static page to target top window
      doc.querySelectorAll('a').forEach((a) => {
        a.setAttribute('target', '_top');
        a.setAttribute('rel', 'noopener noreferrer');
        const href = a.getAttribute('href') || '';
        const txt = (a.textContent || a.innerText || '').trim().toLowerCase();

        if (txt.includes('get started') || href.includes('register')) {
          a.setAttribute('href', '/register');
        } else if (txt.includes('start trading') || href.includes('auth')) {
          a.setAttribute('href', '/auth');
        } else if (txt.includes('parents') || txt.includes('open parent account') || href.includes('parents')) {
          a.setAttribute('href', '/login');
        }

        a.onclick = (e) => {
          const targetHref = a.getAttribute('href') || '';
          const routes: Record<string, string> = { '/': 'home', '/about': 'about-us', '/contact': 'contact', '/register': 'register', '/login': 'login', '/auth': 'auth', '/plans': 'plans', '/markets': 'markets', '/terms': 'terms', '/privacy': 'privacy', '/risk': 'risk' };
          if (routes[targetHref]) {
            e.preventDefault();
            onNavigate(routes[targetHref]);
          }
        };

      });

      // Inject theme variables from the static page palette
      const root = doc.documentElement;
      root.style.setProperty('--color-orbit-accent', '#2563EB');
      root.style.setProperty('--color-orbit-accent-hover', '#E05B00');
      root.style.setProperty('--color-orbit-bg', '#080910');
      root.style.setProperty('--color-orbit-card', '#1C2128');
      root.style.setProperty('--color-orbit-border', '#1C2128');
      root.style.setProperty('--color-orbit-gray-text', '#9CA3AF');
    } catch (err) {
      // cross-origin or other errors are non-fatal
      // console.warn('Could not patch iframe DOM', err);
    }
  }, [onNavigate]);

  return (
    <div className="w-full h-screen m-0 p-0 overflow-hidden">
      <iframe
        ref={iframeRef}
        src="/landing.html"
        title="Static Homepage"
        className="w-full h-full border-0 block"
        onLoad={handleIframeLoad}
      />
    </div>
  );
};
