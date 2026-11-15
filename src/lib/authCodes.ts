// Client helper for the server-side 6-digit email-code flows (signup email
// verification + password reset). Codes are generated/stored/verified by the
// /api/auth-codes serverless function — never in the browser — so a correct
// code works from any tab or device and the account is marked verified on the
// server when the right code is entered.
export type AuthCodePurpose = "signup_verification" | "password_reset";

interface AuthCodeResult {
  success: boolean;
  error?: string;
}

async function callAuthCodesApi(payload: Record<string, unknown>): Promise<AuthCodeResult> {
  try {
    const response = await fetch("/api/auth-codes", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    if (!response.ok || !data || data.success !== true) {
      const errorMessage =
        data?.error ||
        (rawText && !rawText.includes("<!DOCTYPE") && rawText.length < 300
          ? rawText
          : `Request failed (HTTP ${response.status}).`);
      console.error("auth-codes request failed", { status: response.status });
      return { success: false, error: errorMessage };
    }

    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error("auth-codes request failed:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Generates + emails a 6-digit code via Resend.
 * - signup_verification: also creates the Supabase auth account server-side
 *   (unconfirmed), which guarantees NO duplicate Supabase confirmation email.
 * - password_reset: emails a reset code for an existing account.
 */
export const issueAuthCode = (
  email: string,
  purpose: AuthCodePurpose,
  options: { name?: string; password?: string } = {}
) =>
  callAuthCodesApi({
    action: "issue",
    email,
    purpose,
    ...(options.name ? { name: options.name } : {}),
    ...(options.password ? { password: options.password } : {}),
  });

/**
 * Verifies a 6-digit code server-side.
 * - signup_verification: marks the account verified (email confirmed).
 * - password_reset: sets the account's password to `newPassword` (no session
 *   required — this is why a correct code can no longer be rejected).
 */
export const verifyAuthCode = (
  email: string,
  purpose: AuthCodePurpose,
  code: string,
  newPassword?: string
) =>
  callAuthCodesApi({
    action: "verify",
    email,
    purpose,
    code,
    ...(newPassword ? { newPassword } : {}),
  });
