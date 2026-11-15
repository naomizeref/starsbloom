import { buildEmail as renderEmail } from "../src/lib/emailTemplates.js";

// One renderer for verification codes and account notifications.
export function buildEmail(eventType: string, metadata: Record<string, any> = {}) {
  return renderEmail(eventType, {
    ...metadata,
    companyName: process.env.BLOOM_COMPANY_NAME || "Bloom",
    supportEmail: process.env.BLOOM_SUPPORT_EMAIL || "support@bloomsinvest.co",
    siteUrl: process.env.BLOOM_SITE_URL || "",
  });
}
