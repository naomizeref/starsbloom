import { createHash } from "node:crypto";
import { buildEmail } from "./_emailTemplates.js";

export class EmailDeliveryError extends Error {
  constructor(public code: string, public statusCode = 503) {
    super(code === "EMAIL_NOT_CONFIGURED" ? "Email delivery is not configured. Please contact support."
      : "Email could not be sent. Please try again shortly.");
  }
}

export function emailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from || /[\r\n]/.test(from) || /@resend\.dev/i.test(from)) throw new EmailDeliveryError("EMAIL_NOT_CONFIGURED");
  return { apiKey, from };
}

export async function deliverEmail(to: string, eventType: string, metadata: Record<string, any>, eventId: string) {
  const { apiKey, from } = emailConfiguration();
  const rendered = buildEmail(eventType, metadata);
  const replyTo = process.env.BLOOM_REPLY_TO_EMAIL || process.env.BLOOM_SUPPORT_EMAIL;
  const key = createHash("sha256").update(JSON.stringify([to.toLowerCase(), eventType, eventId])).digest("hex");
  const payload = JSON.stringify({ from, to: [to], ...rendered, ...(replyTo ? { reply_to: replyTo } : {}) });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(7000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `bloom/${key}` },
        body: payload,
      });
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.id === "string") return { id: data.id, status: "accepted" as const };
      // Retry transient failures with the EXACT same payload/key, never a test sender.
      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt === 1) throw new EmailDeliveryError("EMAIL_PROVIDER_REJECTED", 502);
      const retryAfter = Number(response.headers.get("retry-after") || 1);
      if (!Number.isFinite(retryAfter) || retryAfter > 2) throw new EmailDeliveryError("EMAIL_RATE_LIMITED", 429);
      await new Promise(resolve => setTimeout(resolve, Math.max(1, retryAfter) * 1000));
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      if (attempt === 1) throw new EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", 502);
    }
  }
  throw new EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", 502);
}
