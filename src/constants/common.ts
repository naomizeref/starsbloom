// Admin access is DB-role-driven: register, then set the user's role to 'admin'
// in Supabase (the client gate is useCurrentUser → users.role, and the server
// gate is the is_admin() RLS function). This hardcoded list is intentionally
// empty — no admin is granted by email. isAdminEmail() therefore always returns
// false, so every check falls back to role === 'admin'.
export const ADMIN_EMAILS: readonly string[] = [];

export const STORAGE_KEYS = {
  USER: "bloom_user",
  LOCAL_USERS: "bloom_local_users",
  ADMIN_WALLETS: "bloom_admin_wallets",
  ANNOUNCEMENTS: "bloom_announcements",
  AUDIT_LOGS: "bloom_audit_logs",
  NOTIFICATIONS: "bloom_notifications"
} as const;

export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_COUNTRY = "United States";
export const DEFAULT_ACCOUNT_TYPE = "Bronze";
export const FALLBACK_GUEST_EMAIL = "guest@gmail.com";
