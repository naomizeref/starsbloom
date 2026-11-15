import { clerkAuthEnabled } from "./_clerkAuth.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type User } from "@supabase/supabase-js";
import { deliverEmail, emailConfiguration, EmailDeliveryError } from "./_emailDelivery.js";

export const config = { maxDuration: 60 };
import { randomInt, createHash, timingSafeEqual } from "node:crypto";

// =============================================================================
// Server-side 6-digit email codes (signup verification + password reset).
// =============================================================================

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } });
}

export type CodePurpose = "signup_verification" | "password_reset";

const PURPOSES: CodePurpose[] = ["signup_verification", "password_reset"];
const CODE_TTL_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;
const ISSUE_COOLDOWN_SECONDS = 45;

const isValidEmail = (value: unknown) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const generateCode = () => {
  return String(100000 + randomInt(0, 900000));
};

const hashCode = (code: string, email: string) =>
  createHash("sha256").update(`${code}:${email}`).digest("hex");

const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

async function sendCodeEmail(email: string, purpose: CodePurpose, code: string, issuedAt: string, name?: string) {
  return deliverEmail(email, purpose === "signup_verification" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET",
    { code, name, email }, `code:${purpose}:${issuedAt}:${hashCode(code, email)}`);
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return null;
  // listUsers returns a page, not the entire account directory.
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Account lookup failed.");
    const match = (data.users as User[]).find(user => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
}

async function issueCode(
  email: string,
  purpose: CodePurpose,
  options: { name?: string; password?: string } = {}
) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL configuration in Vercel environment variables.");
  }

  emailConfiguration(); // Fail before creating accounts or replacing working codes.
  const { data: recent, error: lookupError } = await supabaseAdmin
    .from("auth_email_codes")
    .select("id,created_at,code_hash")
    .eq("email", email)
    .eq("purpose", purpose)
    .maybeSingle();
  if (lookupError) throw new Error("Verification storage is unavailable.");
  if (recent?.created_at) {
    const ageSeconds = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (ageSeconds >= 0 && ageSeconds < ISSUE_COOLDOWN_SECONDS) {
      const wait = Math.ceil(ISSUE_COOLDOWN_SECONDS - ageSeconds);
      throw Object.assign(new Error(`Please wait ${wait}s before requesting another code.`), { statusCode: 429 });
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("auth_email_codes")
    .delete()
    .lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const record = {
    email, purpose, code_hash: hashCode(code, email), attempts: 0, consumed: false,
    created_at: new Date().toISOString(), expires_at: expiresAt,
  };
  // Compare-and-set prevents simultaneous resend requests from replacing one
  // another's code. created_at must change on EVERY resend for cooldown to work.
  const reservation = recent
    ? await supabaseAdmin.from("auth_email_codes").update(record).eq("id", recent.id)
        .eq("created_at", recent.created_at).eq("code_hash", recent.code_hash).select("id").maybeSingle()
    : await supabaseAdmin.from("auth_email_codes").insert(record).select("id").single();
  if (reservation.error?.code === "23505" || !reservation.error && !reservation.data) {
    throw Object.assign(new Error("A code was just requested. Please wait 45 seconds."), { statusCode: 429 });
  }
  if (reservation.error) throw new Error("Unable to save verification code.");

  if (purpose === "signup_verification") {
    const name = options.name || email.split("@")[0];
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      ...(options.password ? { password: options.password } : {}),
      user_metadata: { name, full_name: name },
    });

    let userId = created?.user?.id ?? null;
    if (createError) {
      if (!/already|exists|registered/i.test(createError.message)) {
        throw new Error(`Could not create the account: ${createError.message}`);
      }
      userId = userId ?? (await findAuthUserIdByEmail(email));
    }

    if (userId) {
      await supabaseAdmin
        .from("users")
        .upsert({ id: userId, email, name: name.toUpperCase() }, { onConflict: "id", ignoreDuplicates: true });
    }
  }

  await sendCodeEmail(email, purpose, code, record.created_at, options.name);
}

interface StoredCodeRow {
  id: string;
  email: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  consumed: boolean;
  expires_at: string;
}

async function verifyCode(
  email: string,
  purpose: CodePurpose,
  code: string,
  newPassword?: string
) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL configuration in Vercel environment variables.");
  }

  if (purpose === "password_reset" && (!newPassword || newPassword.length < 8 || newPassword.length > 1024)) {
    throw Object.assign(new Error("New password must be between 8 and 1024 characters."), { statusCode: 400 });
  }
  const invalidError = () => Object.assign(new Error("Invalid or expired code. Please check your inbox or request a new code."), { statusCode: 400 });
  let claimed = false;
  for (let retry = 0; retry < MAX_VERIFY_ATTEMPTS + 1; retry++) {
    const { data, error } = await supabaseAdmin.from("auth_email_codes").select("*")
      .eq("email", email).eq("purpose", purpose).maybeSingle();
    if (error) throw new Error("Verification lookup failed.");
    const stored = data as StoredCodeRow | null;
    if (!stored || stored.consumed || new Date(stored.expires_at).getTime() <= Date.now()) throw invalidError();
    if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw Object.assign(new Error("Too many incorrect attempts. Please request a new code."), { statusCode: 429 });
    }
    const matches = safeEqual(stored.code_hash, hashCode(code, email));
    const { data: updated, error: updateError } = await supabaseAdmin.from("auth_email_codes")
      .update({ attempts: stored.attempts + 1, consumed: matches }).eq("id", stored.id)
      .eq("attempts", stored.attempts).eq("code_hash", stored.code_hash).eq("consumed", false)
      .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (updateError) throw new Error("Unable to verify code. Please try again.");
    if (!updated) continue; // Another verification or resend won; reread safely.
    if (!matches) throw invalidError();
    claimed = true;
    break;
  }
  if (!claimed) throw invalidError();

  const userId = await findAuthUserIdByEmail(email);
  if (!userId) throw invalidError();

  if (purpose === "signup_verification") {
    const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (confirmError) throw new Error(`Could not verify the account: ${confirmError.message}`);
  } else {
    if (!newPassword || newPassword.length < 8) {
      throw Object.assign(new Error("New password must be at least 8 characters."), { statusCode: 400 });
    }
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (pwError) throw new Error(`Could not set the new password: ${pwError.message}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST" && clerkAuthEnabled()) return res.status(410).json({ success: false, error: "Use the sign-in page to manage your Clerk account." });
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};
    if (JSON.stringify(body).length > 5000) return res.status(400).json({ success: false, error: "Request is too large." });

    const action = String(body.action || "");
    const purpose = String(body.purpose || "") as CodePurpose;

    if (!PURPOSES.includes(purpose)) {
      return res.status(400).json({ success: false, error: "Unknown purpose." });
    }

    if (action === "issue") {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: "A valid email address is required." });
      }
      await issueCode(email, purpose, {
        name: typeof body.name === "string" ? body.name.trim().slice(0, 150) : undefined,
        password: typeof body.password === "string" ? body.password : undefined,
      });
      return res.status(200).json({ success: true, message: "Code sent." });
    }

    if (action === "verify") {
      const email = normalizeEmail(body.email);
      const code = String(body.code || "").trim();
      if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, error: "A valid email and 6-digit code are required." });
      }
      await verifyCode(
        email,
        purpose,
        code,
        typeof body.newPassword === "string" ? body.newPassword : undefined
      );
      return res.status(200).json({ success: true, message: "Verified." });
    }

    return res.status(400).json({ success: false, error: "Unknown action." });
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    console.error("auth-codes failed", { status, code: err.code || "AUTH_CODE_REQUEST_FAILED" });
    return res.status(status).json({ success: false,
      error: status < 500 || err instanceof EmailDeliveryError ? err.message : "Unable to complete this request. Please try again or contact support.",
      code: err.code || "AUTH_CODE_REQUEST_FAILED" });
  }
}
