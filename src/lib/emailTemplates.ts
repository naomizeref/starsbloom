export type Detail = { label: string; value: string | number | undefined | null };

export const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

export const formatMoney = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined;
};

export const buildDetails = (details: Detail[]) => details
  .filter(detail => detail.value !== undefined && detail.value !== null && detail.value !== "")
  .map(detail => `
    <tr>
      <td style="padding: 8px 0; color: #94a3b8; font-weight: 600;">${escapeHtml(detail.label)}</td>
      <td style="padding: 8px 0; color: #f8fafc; text-align: right; font-weight: 700; word-break: break-word;">${escapeHtml(detail.value)}</td>
    </tr>
  `).join("");

export const resolveEvent = (eventType: string, metadata: any) => {
  const amount = metadata.amount ?? metadata.allocation ?? metadata.payoutAmount ?? metadata.rewardAmount;
  const commonDetails: Detail[] = [
    { label: "Reference", value: metadata.reference || metadata.transactionId || metadata.claimId || metadata.eventId },
    { label: "Status", value: metadata.status },
    { label: "Date", value: metadata.date }
  ];

  switch (eventType) {
    case "WELCOME":
      return {
        subject: `Welcome to ${metadata.companyName}`,
        heading: "Welcome to your trading workspace",
        intro: "Your account has been created successfully. You can now access your dashboard, wallet, investment plans, copy trading, and verification tools.",
        accent: "#0509f8ff",
        details: [
          { label: "Account", value: metadata.email },
          { label: "Profile", value: metadata.name }
        ]
      };
    case "EMAIL_VERIFICATION":
      return {
        subject: `Your ${metadata.companyName} verification code`,
        heading: "Email Verification Code",
        intro: `Use the 6-digit confirmation code below to verify your email address and activate your ${metadata.companyName} trading account.`,
        accent: "#1658FF",
        details: [
          { label: "Verification Code", value: metadata.code || metadata.verificationCode || "------" },
          { label: "Account Email", value: metadata.email },
          { label: "Valid For", value: "15 minutes" }
        ]
      };
    case "PASSWORD_RESET":
      return {
        subject: `Your ${metadata.companyName} password reset code`,
        heading: "Password Reset Code",
        intro: `We received a request to reset your password. Use the 6-digit verification code below to set a new password.`,
        accent: "#1658FF",
        details: [
          { label: "Reset Code", value: metadata.code || "------" },
          { label: "Account Email", value: metadata.email },
          { label: "Valid For", value: "15 minutes" }
        ]
      };
    case "ACCOUNT_SUSPENDED":
      return {
        subject: `Your account has been suspended - ${metadata.companyName}`,
        heading: "Your account has been suspended",
        intro: "Your account has been suspended by an administrator. Your active investments and copy trades are paused, including earnings and maturity countdowns. Trading and withdrawals are disabled. Please contact our support team if you have questions or need assistance.",
        accent: "#f59e0b",
        details: [
          { label: "Account", value: metadata.email },
          { label: "Support", value: metadata.supportEmail },
          ...commonDetails
        ]
      };
    case "SECURITY_ALERT":
      return {
        subject: `[Security Alert] New login detected - ${metadata.companyName}`,
        heading: "New login notification",
        intro: "A sign-in event was detected for your account. If this was not you, reset your password and contact support immediately.",
        accent: "#ef4444",
        details: [
          { label: "Time", value: metadata.time },
          { label: "IP Address", value: metadata.ip || "Unknown" },
          { label: "Location", value: metadata.location || "Unknown" },
          { label: "Device", value: metadata.device || "Web session" }
        ]
      };
    case "DEPOSIT_SUBMITTED":
      return {
        subject: `Deposit submitted - ${metadata.companyName}`,
        heading: "Deposit submitted for review",
        intro: "We received your deposit submission. Treasury review will verify the payment details before crediting your balance.",
        accent: "#1b66fcff",
        details: [
          { label: "Amount", value: formatMoney(amount) },
          { label: "Asset / Network", value: metadata.asset },
          { label: "Transaction Hash", value: metadata.txHash },
          ...commonDetails
        ]
      };
    case "DEPOSIT_SUCCESS":
    case "DEPOSIT_APPROVED":
      return {
        subject: `Deposit approved - ${metadata.companyName}`,
        heading: "Deposit credited",
        intro: "Your deposit has been approved and credited to your wallet balance.",
        accent: "#2055f3ff",
        details: [
          { label: "Amount", value: formatMoney(amount) },
          { label: "Asset / Network", value: metadata.asset },
          { label: "Transaction Hash", value: metadata.txHash },
          ...commonDetails
        ]
      };
    case "DEPOSIT_REJECTED":
      return {
        subject: `Deposit rejected - ${metadata.companyName}`,
        heading: "Deposit could not be verified",
        intro: "Your recent deposit submission was rejected during verification. Check the details below or contact support.",
        accent: "#ef4444",
        details: [
          { label: "Amount", value: formatMoney(amount) },
          { label: "Reason", value: metadata.reason || "Proof of payment could not be verified" },
          ...commonDetails
        ]
      };
    case "WITHDRAWAL_SUBMITTED":
      return {
        subject: `Withdrawal requested - ${metadata.companyName}`,
        heading: "Withdrawal request received",
        intro: "Your withdrawal request is queued for security screening and execution.",
        accent: "#0b4bf5ff",
        details: [
          { label: "Amount", value: formatMoney(amount) },
          { label: "Asset", value: metadata.asset },
          { label: "Destination", value: metadata.destinationAddress || metadata.destination },
          ...commonDetails
        ]
      };
    case "WITHDRAWAL_APPROVED":
    case "WITHDRAWAL_SUCCESS":
      return {
        subject: `Withdrawal processed - ${metadata.companyName}`,
        heading: "Withdrawal completed",
        intro: "Your withdrawal has been approved. Check your wallet for its payment details and status.",
        accent: "#0c49ebff",
        details: [
          { label: "Amount", value: formatMoney(amount) },
          { label: "Asset", value: metadata.asset },
          { label: "TxID", value: metadata.txHash || metadata.transactionHash || metadata.txId },
          ...commonDetails
        ]
      };
    case "WITHDRAWAL_REJECTED":
      return {
        subject: `Withdrawal rejected - ${metadata.companyName}`,
        heading: "Withdrawal was not approved",
        intro: "Your withdrawal request could not be processed. Funds remain safely in your balance.",
        accent: "#ef4444",
        details: [
          { label: "Amount", value: formatMoney(amount) },
          { label: "Reason", value: metadata.reason || "Please contact support for details." },
          ...commonDetails
        ]
      };
    case "INVESTMENT_STARTED":
      return {
        subject: `Plan activated - ${metadata.companyName}`,
        heading: "Investment plan is now active",
        intro: "Your capital has been allocated to your selected investment tier.",
        accent: "#1658FF",
        details: [
          { label: "Plan", value: metadata.planName || metadata.investmentName || metadata.tierName },
          { label: "Principal", value: formatMoney(amount) },
          { label: "Duration", value: metadata.duration ?? (metadata.durationDays != null ? `${metadata.durationDays} days` : undefined) },
          { label: "Target ROI", value: metadata.expectedReturn ?? (metadata.roi != null ? `${metadata.roi}%` : undefined) },
          ...commonDetails
        ]
      };
    case "INVESTMENT_COMPLETED":
      return {
        subject: `Plan matured - ${metadata.companyName}`,
        heading: "Investment completed with profit",
        intro: "Your investment cycle has completed and the principal with generated returns is now available in your balance.",
        accent: "#1658FF",
        details: [
          { label: "Plan", value: metadata.planName || metadata.investmentName || metadata.tierName },
          { label: "Principal", value: formatMoney(metadata.principal ?? metadata.amount) },
          { label: "Profit Earned", value: formatMoney(metadata.profit ?? metadata.returnAmount) },
          { label: "Total Credited", value: formatMoney(metadata.totalPayout ?? metadata.total ?? metadata.payoutAmount) },
          ...commonDetails
        ]
      };
    case "PROFIT_DISTRIBUTION":
      return {
        subject: `Profit credited - ${metadata.companyName}`,
        heading: "Daily return distribution",
        intro: "Returns from your active investment plans have been credited to your wallet.",
        accent: "#1658FF",
        details: [
          { label: "Profit Amount", value: formatMoney(amount) },
          { label: "Plan", value: metadata.planName },
          ...commonDetails
        ]
      };
    case "COPY_TRADE_STARTED":
      return {
        subject: `Copy trading active - ${metadata.companyName}`,
        heading: "Now copying trader strategy",
        intro: "Your allocation is active. View your position for its saved terms and progress.",
        accent: "#1658FF",
        details: [
          { label: "Trader", value: metadata.traderName },
          { label: "Allocation", value: formatMoney(amount) },
          { label: "Strategy", value: metadata.strategy || undefined },
          ...commonDetails
        ]
      };
    case "COPY_TRADE_COMPLETED":
      return {
        subject: `Copy trade closed - ${metadata.companyName}`,
        heading: "Copy trading payout completed",
        intro: "A mirrored position has closed and profits have been settled to your account.",
        accent: "#1658FF",
        details: [
          { label: "Trader", value: metadata.traderName },
          { label: "Pair", value: metadata.pair || metadata.symbol },
          { label: "Profit", value: formatMoney(metadata.pnl ?? metadata.profit) },
          { label: "Total credited", value: formatMoney(metadata.total ?? metadata.payoutAmount) },
          ...commonDetails
        ]
      };
    case "TRADE_EXECUTED":
    case "COPY_TRADE_ACTIVE":
      return {
        subject: `Trade executed - ${metadata.companyName}`,
        heading: "Market order completed",
        intro: "Your order has completed. View your portfolio for the updated holdings.",
        accent: "#1658FF",
        details: [
          { label: "Trader", value: metadata.traderName },
          { label: "Pair", value: metadata.pair || metadata.symbol },
          { label: "Side", value: metadata.side },
          { label: "Amount", value: formatMoney(amount) },
          { label: "Execution price", value: formatMoney(metadata.entryPrice ?? metadata.price) },
          ...commonDetails
        ]
      };
    case "COPY_TRADE_CANCELLED":
      return {
        subject: `Copy trading stopped - ${metadata.companyName}`,
        heading: "Copy trading relationship ended",
        intro: "You have stopped copying the trader. All remaining allocated margin has been returned to your available wallet balance.",
        accent: "#94a3b8",
        details: [
          { label: "Trader", value: metadata.traderName },
          { label: "Returned Balance", value: formatMoney(amount) },
          ...commonDetails
        ]
      };
    case "SUPPORT_TICKET_CREATED":
      return {
        subject: `Ticket #${metadata.ticketId || metadata.reference || metadata.id || ""} created - ${metadata.companyName}`,
        heading: "Support ticket opened",
        intro: "We received your inquiry. A specialist from our team will review it and reply shortly.",
        accent: "#1658FF",
        details: [
          { label: "Ticket ID", value: metadata.ticketId || metadata.reference || metadata.id },
          { label: "Subject", value: metadata.subject || metadata.title },
          { label: "Priority", value: metadata.priority || "Standard" },
          ...commonDetails
        ]
      };
    case "SUPPORT_TICKET_REPLY":
      return {
        subject: `Reply on ticket #${metadata.ticketId || metadata.reference || metadata.id || ""} - ${metadata.companyName}`,
        heading: "Support ticket updated",
        intro: metadata.replyPreview || metadata.message || "There is a new message on your support ticket.",
        accent: "#1658FF",
        details: [
          { label: "Ticket ID", value: metadata.ticketId || metadata.reference || metadata.id },
          { label: "Agent", value: metadata.agentName },
          ...commonDetails
        ]
      };
    case "KYC_SUBMITTED":
      return {
        subject: `Identity verification submitted - ${metadata.companyName}`,
        heading: "KYC documents received",
        intro: "Your identity verification documents have been submitted for review. We will notify you when the status changes.",
        accent: "#1658FF",
        details: [
          { label: "Document Type", value: metadata.documentType || "Government Issued ID" },
          { label: "Country", value: metadata.country },
          ...commonDetails
        ]
      };
    case "KYC_APPROVED":
      return {
        subject: `Identity verified - ${metadata.companyName}`,
        heading: "Account verified successfully",
        intro: "Your identity verification has been approved.",
        accent: "#1658FF",
        details: [
          { label: "Tier", value: metadata.tier || "Fully Verified" },
          ...commonDetails
        ]
      };
    case "KYC_REJECTED":
      return {
        subject: `Identity verification update - ${metadata.companyName}`,
        heading: "Action required on KYC submission",
        intro: "We could not verify your identity with the provided documents. Please log in to resubmit with clearer photos.",
        accent: "#ef4444",
        details: [
          { label: "Reason", value: metadata.reason || "Please review your submission in the dashboard." },
          ...commonDetails
        ]
      };
    case "AIRDROP_CLAIM_SUBMITTED":
      return {
        subject: `Airdrop claim received - ${metadata.companyName}`,
        heading: "Claim submitted for verification",
        intro: "Your community airdrop reward claim is queued for distribution review.",
        accent: "#1658FF",
        details: [
          { label: "Campaign", value: metadata.campaignName || metadata.campaignTitle || "Community Rewards" },
          { label: "Claim amount", value: metadata.token && metadata.rewardAmount != null ? `${metadata.rewardAmount} ${metadata.token}` : formatMoney(amount) },
          ...commonDetails
        ]
      };
    case "AIRDROP_CLAIM_APPROVED":
      return {
        subject: `Airdrop reward credited - ${metadata.companyName}`,
        heading: "Airdrop reward credited",
        intro: "Your airdrop claim has been approved and the reward has been credited to your account balance.",
        accent: "#1658FF",
        details: [
          { label: "Reward", value: formatMoney(amount) },
          { label: "Campaign", value: metadata.campaignName || metadata.campaignTitle || "Community Rewards" },
          ...commonDetails
        ]
      };
    case "AIRDROP_CLAIM_REJECTED":
      return {
        subject: `Airdrop claim status - ${metadata.companyName}`,
        heading: "Airdrop claim ineligible",
        intro: "Your airdrop claim was not approved due to criteria verification.",
        accent: "#ef4444",
        details: [
          { label: "Reason", value: metadata.reason || "Eligibility criteria not met" },
          ...commonDetails
        ]
      };
    case "TOPUP_SUCCESS":
      return {
        subject: `Investment top-up confirmed - ${metadata.companyName}`,
        heading: "Investment topped up",
        intro: "Your additional funds have been allocated to this investment.",
        accent: "#1658FF",
        details: [
          { label: "Credit Amount", value: formatMoney(amount) },
          { label: "Investment", value: metadata.investmentName },
          ...commonDetails
        ]
      };
    case "ANNOUNCEMENT":
      return {
        subject: metadata.subject || `Platform update from ${metadata.companyName}`,
        heading: metadata.title || "Important Account Notice",
        intro: metadata.message || metadata.content || "Please review this important announcement regarding your account.",
        accent: "#1658FF",
        details: commonDetails
      };
    default: throw new Error("Unsupported email event.");
  }
};


export function buildEmail(eventType: string, metadata: Record<string, any> = {}) {
  const companyName = String(metadata.companyName || "Bloom");
  const supportEmail = String(metadata.supportEmail || "support@bloomsinvest.co");
  const event = resolveEvent(eventType, { ...metadata, companyName });
  const greeting = String(metadata.name || metadata.firstName || "there");
  const code = /^(EMAIL_VERIFICATION|PASSWORD_RESET)$/.test(eventType) ? String(metadata.code || "") : "";
  const details = event.details.filter(d => d.value !== undefined && d.value !== null && d.value !== "" && !/Code$/.test(d.label) && !(code && d.label === "Valid For"));
  // Only the server sets the site URL. Never accept a message-specific redirect.
  let siteUrl = "";
  try { const url = new URL(metadata.siteUrl); if (url.protocol === "https:") siteUrl = url.origin; } catch { /* No link until configured. */ }
  const path = eventType.startsWith("SUPPORT_") ? "/dashboard/support"
    : eventType.startsWith("COPY_") ? "/copy-trading"
    : eventType.startsWith("INVESTMENT_") || eventType === "TOPUP_SUCCESS" ? "/dashboard/portfolio"
    : eventType.startsWith("KYC_") ? "/dashboard/kyc"
    : eventType.startsWith("DEPOSIT_") || eventType.startsWith("WITHDRAWAL_") ? "/dashboard/wallet" : "/dashboard";
  const actionUrl = !code && siteUrl ? `${siteUrl}${path}` : "";
  const securityNote = code ? "This code expires in 15 minutes. Never share it. If you did not request it, ignore this email." : "";
  const text = [companyName, event.heading, `Hello ${greeting},`, event.intro, code && `Code: ${code}`, securityNote,
    ...details.map(d => `${d.label}: ${d.value}`), actionUrl && `View in Bloom: ${actionUrl}`, `Need help? ${supportEmail}`].filter(Boolean).join("\n\n");
  return {
    subject: String(event.subject).replace(/[\r\n]+/g, " "),
    text,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(event.heading)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(event.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe2ea;border-radius:16px">
<tr><td style="padding:24px;background:#0b101a;color:#ffffff;font-size:26px;font-weight:bold;border-radius:16px 16px 0 0">${escapeHtml(companyName)}</td></tr>
<tr><td style="padding:28px 24px;font-size:16px;line-height:1.6;overflow-wrap:anywhere">
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#172033">${escapeHtml(event.heading)}</h1>
<p>Hello ${escapeHtml(greeting)},</p><p>${escapeHtml(event.intro)}</p>
${code ? `<p style="padding:20px 8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;font:700 32px monospace;letter-spacing:6px;color:#1d4ed8">${escapeHtml(code)}</p><p style="font-size:14px;color:#475569">${escapeHtml(securityNote)}</p>` : ""}
${details.length ? `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e2e8f0">${details.map(d => `<tr><th scope="row" align="left" style="padding:10px 12px 10px 0;border-bottom:1px solid #e2e8f0;color:#475569;font-weight:normal;vertical-align:top">${escapeHtml(d.label)}</th><td align="right" style="padding:10px 0;border-bottom:1px solid #e2e8f0;word-break:break-word">${escapeHtml(d.value)}</td></tr>`).join("")}</table>` : ""}
${actionUrl ? `<p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold">View in Bloom</a></p>` : ""}
<p style="margin:24px 0 0;font-size:14px;color:#475569">Need help? <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1d4ed8">${escapeHtml(supportEmail)}</a></p>
</td></tr></table><p style="font-size:12px;color:#64748b">${escapeHtml(companyName)} · Account notification</p>
</td></tr></table></body></html>`
  };
}
