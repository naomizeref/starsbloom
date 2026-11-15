import type { SupabaseClient } from "@supabase/supabase-js";

export const ACCOUNT_RESTRICTED_MESSAGE = "Your account is suspended or restricted. Trading, investing and withdrawals are disabled. Please contact support.";

// Always fetch current status: an already-open tab may predate the suspension.
// The database migration enforces this again atomically with the actual write.
export async function getFinancialAccessError(client: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return "You must be signed in to continue.";
  try {
    const { data, error } = await client.from("users").select("status").eq("id", userId).single();
    if (error || !data) return "Unable to verify your account status. Please try again.";
    return data.status === "active" ? null : ACCOUNT_RESTRICTED_MESSAGE;
  } catch {
    return "Unable to verify your account status. Please try again.";
  }
}

export function financialActionError(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown })?.message;
  if (typeof message !== "string") return fallback;
  if (message.includes("Trading, investing and withdrawals are disabled")) return ACCOUNT_RESTRICTED_MESSAGE;
  if (/needs payout reconciliation|has not matured|cannot be topped up|cannot be claimed|Invalid top-up amount|Invalid investment amount|Invalid copy amount/.test(message)) return message;
  const code = (error as { code?: string })?.code;
  if (code === "PGRST202" || code === "42883" || code === "42703" || code === "42P01") return "This action is temporarily unavailable because the database needs an update. Please contact support.";
  if (code === "42501") return "You do not have permission to perform this action. Please sign in again or contact support.";
  return fallback;
}
