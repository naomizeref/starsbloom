import clerkSessionHandler from "./api/clerk-session";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import marketsHandler from "./api/markets";
import dotenv from "dotenv";
import sendEmailHandler from "./api/send-email";
import authCodesHandler from "./api/auth-codes";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const PORT = parseInt(process.env.PORT || "5173", 10);
const HMR_PORT = parseInt(process.env.VITE_HMR_PORT || process.env.HMR_PORT || "24680", 10);

// Lazy initialize Gemini client to prevent startup crash if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured. Please add it via AI Studio Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  // Loud config check: transactional email cannot deliver to real users
  // without a verified sender. Warn clearly at startup rather than silently
  // failing per-send (the handler also hard-fails the request, see api/send-email.ts).
  if (!process.env.RESEND_FROM_EMAIL) {
    console.warn("[config] RESEND_FROM_EMAIL is not set — transactional email will be rejected until a verified sender address is configured.");
  }

  const app = express();
  app.use(express.json());

  // API Route: Send Transactional Email using Resend
  app.post("/api/send-email", sendEmailHandler as any);

  // API Route: Server-side 6-digit email codes (signup verification +
  // password reset). Mirrors the /api/auth-codes Vercel function.
  app.post("/api/auth-codes", authCodesHandler as any);
  app.post("/api/clerk-session", clerkSessionHandler as any);

  // API Route: Proxy Parents Portal and inject 'Get Started' navigation bridge
  app.get("/api/parents-proxy", async (req, res) => {
    try {
      const targetUrl = "https://parents.joinbloom.co/signup";
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      let html = await response.text();

      // Remove manifest link to avoid CORS errors
      html = html.replace(/<link[^>]*rel=["']manifest["'][^>]*>/gi, "");

      // Injected head script: overrides window.open, history navigation, and captures all click/submit events early
      const headInjection = `
        <base href="https://parents.joinbloom.co/">
        <script>
          (function() {
            function redirectToLogin() {
              if (window.parent && window.parent !== window) {
                try {
                  window.parent.postMessage({ type: 'NAVIGATE_TO_LOGIN' }, '*');
                } catch(e) {}
              }
              try {
                if (window.top && window.top !== window) {
                  window.top.location.href = '/login';
                  return;
                }
              } catch(e) {}
              window.location.href = '/login';
            }

            // Override window.open to prevent popup/new tab navigation
            window.open = function() {
              redirectToLogin();
              return null;
            };

            // Override History methods
            var origReplace = History.prototype.replaceState;
            var origPush = History.prototype.pushState;

            History.prototype.replaceState = function(state, unused, url) {
              if (typeof url === 'string' && (url.includes('login') || url.includes('signup') || url.includes('joinbloom') || url.includes('auth'))) {
                redirectToLogin();
                return;
              }
              try {
                return origReplace.call(this, state, unused, '/signup');
              } catch (err) {
                console.warn('Silenced replaceState SecurityError:', err);
              }
            };

            History.prototype.pushState = function(state, unused, url) {
              if (typeof url === 'string' && (url.includes('login') || url.includes('signup') || url.includes('joinbloom') || url.includes('auth'))) {
                redirectToLogin();
                return;
              }
              try {
                return origPush.call(this, state, unused, '/signup');
              } catch (err) {
                console.warn('Silenced pushState SecurityError:', err);
              }
            };

            function isActionable(el) {
              if (!el) return false;
              var tag = (el.tagName || '').toUpperCase();
              if (tag === 'A' || tag === 'BUTTON') return true;
              if (tag === 'INPUT' && (el.type === 'submit' || el.type === 'button' || el.type === 'image')) return true;

              var role = (el.getAttribute('role') || '').toLowerCase();
              if (role === 'button' || role === 'link') return true;

              var text = (el.innerText || el.textContent || el.value || '').toLowerCase().trim();
              var id = (el.id || '').toLowerCase();
              var cls = (el.className || '').toString().toLowerCase();
              var testId = (el.getAttribute('data-testid') || '').toLowerCase();
              var href = (el.getAttribute('href') || '').toLowerCase();

              return (
                text.includes('get started') ||
                text.includes('getstarted') ||
                text.includes('start') ||
                text.includes('sign up') ||
                text.includes('signup') ||
                text.includes('log in') ||
                text.includes('login') ||
                text.includes('continue') ||
                text.includes('next') ||
                text.includes('join') ||
                text.includes('register') ||
                text.includes('submit') ||
                id.includes('get-started') ||
                cls.includes('get-started') ||
                testId.includes('get-started') ||
                href.length > 0
              );
            }

            function handleEarlyCapture(e) {
              var el = e.target;
              while (el && el !== document.body && el !== document.documentElement) {
                if (isActionable(el)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  redirectToLogin();
                  return false;
                }
                el = el.parentElement;
              }
            }

            window.addEventListener('click', handleEarlyCapture, true);
            document.addEventListener('click', handleEarlyCapture, true);
            window.addEventListener('submit', function(e) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              redirectToLogin();
              return false;
            }, true);
            document.addEventListener('submit', function(e) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              redirectToLogin();
              return false;
            }, true);
          })();
        </script>
      `;

      if (html.includes("<head>")) {
        html = html.replace("<head>", "<head>" + headInjection);
      } else {
        html = headInjection + html;
      }

      // Inject mutation observer & body bridge script before </body>
      const bridgeScript = `
        <script>
          (function() {
            function redirectToLogin() {
              if (window.parent && window.parent !== window) {
                try {
                  window.parent.postMessage({ type: 'NAVIGATE_TO_LOGIN' }, '*');
                } catch(e) {}
              }
              try {
                if (window.top && window.top !== window) {
                  window.top.location.href = '/login';
                  return;
                }
              } catch(e) {}
              window.location.href = '/login';
            }

            function patchElements() {
              document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]').forEach(function(el) {
                if (!el.dataset.bloomIntercepted) {
                  el.dataset.bloomIntercepted = "true";
                  if (el.tagName === 'A') {
                    el.setAttribute('target', '_self');
                    el.setAttribute('href', 'javascript:void(0);');
                  }
                  el.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    redirectToLogin();
                    return false;
                  }, true);
                }
              });
            }

            // Run on load and whenever DOM changes
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', patchElements);
            } else {
              patchElements();
            }

            var observer = new MutationObserver(function() {
              patchElements();
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
          })();
        </script>
      `;

      html = html.replace("</body>", bridgeScript + "</body>");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(html);
    } catch (err: any) {
      console.error("Parents proxy error:", err);
      return res.redirect("/login");
    }
  });

  // Share the production handler so local and deployed quote validation agree.
  app.get("/api/markets", (req, res) => marketsHandler(req as any, res as any));

  // Dev server using Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: HMR_PORT
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    if (process.env.NODE_ENV !== "production") {
      console.info(`Bloom institutional platform listening at http://0.0.0.0:${PORT}`);
    }
  });
}

startServer().catch((err) => {
  console.error("Critical server bootstrap error:", err);
});




