import { authenticateBloomRequest } from "./_clerkAuth.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { EMAIL_EVENTS } from "../src/lib/emailEvents.js";
import { deliverEmail, EmailDeliveryError } from "./_emailDelivery.js";

export { buildEmail } from "./_emailTemplates.js";
export const config = { maxDuration: 60 };
const validEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ success: false, error: "Method not allowed" }); }
  try {
    const authorization = req.headers.authorization;
    const token = typeof authorization === "string" && authorization.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw fail(401, "Sign in to send account notifications.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { to, eventType, metadata = {} } = body || {};
    if (!validEmail(to) || !EMAIL_EVENTS.includes(eventType) || ["EMAIL_VERIFICATION", "PASSWORD_RESET"].includes(eventType)) {
      throw fail(400, "Invalid recipient or notification type.");
    }
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object" || JSON.stringify(metadata).length > 12000 ||
        Object.values(metadata).some(value => value != null && !["string", "number", "boolean"].includes(typeof value)) ||
        typeof metadata.eventId !== "string" || !metadata.eventId || metadata.eventId.length > 300) {
      throw fail(400, "Invalid notification details or event reference.");
    }
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw fail(503, "Notification service is not configured.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } });
    const account = await authenticateBloomRequest(client, token);
    const { data: profile, error: profileError } = await client.from("users").select("role,status").eq("id", account.id).single();
    if (profileError || !profile || profile.status !== "active") throw fail(403, "This account cannot send notifications.");
    const isAdmin = profile.role === "admin";
    let recipient = to.trim().toLowerCase();
    const self = recipient === account.email.toLowerCase();
    const supportInbox = (process.env.BLOOM_SUPPORT_EMAIL || "support@bloomsinvest.co").toLowerCase();
    let safeMetadata = { ...metadata };
    if (!self && !isAdmin) {
      // The only cross-account user email is a notification to the configured
      // support inbox about a ticket they own. The message comes from the DB.
      if (eventType !== "SUPPORT_TICKET_REPLY" || typeof metadata.reference !== "string") throw fail(403, "You cannot email this recipient.");
      const { data: ticket, error } = await client.from("support_tickets").select("id,subject,messages").eq("id", metadata.reference).eq("user_id", account.id).single();
      if (error || !ticket) throw fail(403, "Support ticket not found.");
      const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
      const latest = messages.at(-1);
      if (latest?.sender !== "user") throw fail(400, "No new user reply on this ticket.");
      recipient = supportInbox;
      safeMetadata = { eventId: `ticket:userreply:${ticket.id}:${messages.length}`, reference: ticket.id, subject: ticket.subject,
        name: "Support team", replyPreview: String(latest.text || "").slice(0, 500) };
    } else if (!self) {
      const { data: recipientProfile, error } = await client.from("users").select("id").ilike("email", recipient.replace(/[\\%_]/g, "\\$&")).maybeSingle();
      if (error || !recipientProfile) throw fail(400, "Recipient account not found.");
    }
    // Branding, links, sender and Reply-To are always configured on the server.
    const result = await deliverEmail(recipient, eventType, safeMetadata, safeMetadata.eventId);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const status = error instanceof SyntaxError ? 400 : error.statusCode || 500;
    const message = status < 500 || error instanceof EmailDeliveryError ? error.message : "Unable to send this notification. Please try again later.";
    // Never log recipient details, passwords, codes, provider bodies or keys.
    console.error("Email request failed", { status, code: error.code || "EMAIL_REQUEST_FAILED" });
    return res.status(status).json({ success: false, error: message, code: error.code || "EMAIL_REQUEST_FAILED" });
  }
}
