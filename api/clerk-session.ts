import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { authFailure, clerkAuthEnabled, verifiedClerkAccount, provisionClerkAccount } from "./_clerkAuth.js";

export const config = { maxDuration: 30 };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    if (!clerkAuthEnabled()) throw authFailure(503, "Clerk sign-in has not been enabled yet.");
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw authFailure(401, "Please sign in to continue.");
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw authFailure(503, "Account sign-in is not configured yet.");
    const account = await verifiedClerkAccount(token);
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } });
    const profile = await provisionClerkAccount(client, account);
    // Verify the browser's actual database access too. A missing third-party
    // provider or SQL setup must not open an empty/partially working dashboard.
    const publicKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!publicKey) throw authFailure(503, "Account access is not configured yet. Please contact support.");
    const scoped = createClient(url, publicKey, { accessToken: async () => token,
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } });
    const { data: mappedId, error: accessError } = await scoped.rpc("bloom_current_user_id");
    if (accessError || mappedId !== profile.id) throw authFailure(503, "Unable to access your Bloom account. Please contact support.");
    // Retain the Bloom ID expected by every financial record and private upload path.
    return res.status(200).json({ user: { id: profile.id, email: profile.email,
      app_metadata: { provider: "clerk" }, user_metadata: { name: profile.name },
      aud: "authenticated", created_at: "", email_confirmed_at: new Date().toISOString() } });
  } catch (error: any) {
    const status = error.statusCode || 503;
    return res.status(status).json({ error: error.statusCode ? error.message : "Unable to open your Bloom account. Please try again." });
  }
}
