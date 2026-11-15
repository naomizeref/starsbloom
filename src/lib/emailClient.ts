import { getBloomCredentials } from "./authRuntime";
import { supabase } from "../lib/supabase";
import type { TransactionalEmailEvent } from "./emailEvents";
export type { TransactionalEmailEvent } from "./emailEvents";

export const sendTransactionalEmail = async (to: string, eventType: TransactionalEmailEvent, metadata: any = {}) => {
  try {
    const { token, userId } = await getBloomCredentials(supabase);
    if (!token || !userId) return { success: false as const, error: "Sign in to send account notifications." };
    const eventId = metadata.eventId || (eventType === "WELCOME" ? `welcome:${userId}` : crypto.randomUUID());
    const response = await fetch("/api/send-email", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, eventType, metadata: { ...metadata, eventId } }),
    });

    // The endpoint always answers with JSON, but a proxy/404/HTML error page
    // would make response.json() throw — normalize that into a failed result
    // so callers can react instead of silently losing the send.
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success !== true) {
      const errorMessage = data?.error || `Email request failed (HTTP ${response.status}).`;
      console.error(`Email sending failed for ${eventType}:`, errorMessage);
      return { success: false as const, error: errorMessage };
    }

    return data;
  } catch (error: any) {
    console.error(`Email sending failed for ${eventType}:`, error?.message || error);
    return { success: false as const, error: error?.message || String(error) };
  }
};

export const sendWelcomeEmail = (to: string, name: string, metadata: any = {}) => sendTransactionalEmail(to, "WELCOME", { ...metadata, name, email: to });
export const sendSecurityAlert = (to: string, metadata: any) => sendTransactionalEmail(to, "SECURITY_ALERT", metadata);
export const sendDepositEmail = (to: string, metadata: any) => sendTransactionalEmail(to, "DEPOSIT_APPROVED", metadata);
export const sendWithdrawalEmail = (to: string, metadata: any) => sendTransactionalEmail(to, "WITHDRAWAL_APPROVED", metadata);
export const sendProfitEmail = (to: string, metadata: any) => sendTransactionalEmail(to, "INVESTMENT_COMPLETED", metadata);
export const sendCopyTradeEmail = (to: string, metadata: any) => sendTransactionalEmail(to, "COPY_TRADE_STARTED", metadata);
export const sendTopUpEmail = (to: string, metadata: any) => sendTransactionalEmail(to, "TOPUP_SUCCESS", metadata);


