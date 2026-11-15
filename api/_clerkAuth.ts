import { createClerkClient, verifyToken } from "@clerk/backend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clerkSignupProfile } from './_clerkSignupProfile.js';

export const authFailure = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
export const clerkAuthEnabled = () => process.env.AUTH_PROVIDER === "clerk";

export async function verifiedClerkAccount(token: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const issuer = process.env.CLERK_JWT_ISSUER?.replace(/\/$/, "");
  const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean);
  if (!secretKey || !issuer || !authorizedParties?.length) throw authFailure(503, "Account sign-in is not configured yet.");
  let claims;
  try {
    claims = await verifyToken(token, { secretKey, issuer, authorizedParties });
  } catch { throw authFailure(401, "Your session has expired. Please sign in again."); }
  if (!claims.sub?.startsWith("user_") || typeof claims.sid !== "string" || claims.iss !== issuer ||
      !claims.azp || !authorizedParties.includes(claims.azp) || claims.sts === "pending") {
    throw authFailure(401, "Please finish signing in to your account.");
  }
  const clerk = createClerkClient({ secretKey });
  const [user, session] = await Promise.all([clerk.users.getUser(claims.sub), clerk.sessions.getSession(claims.sid)]);
  if (session.status !== "active" || session.userId !== user.id || user.banned || user.locked) throw authFailure(401, "Please sign in again.");
  const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") throw authFailure(403, "Verify your email address to open Bloom.");
  const signupProfile = user.externalId ? null : clerkSignupProfile(user.unsafeMetadata?.bloomProfile);
  return { subject: user.id, issuer, email: primary.emailAddress.toLowerCase(), signupProfile,
    legacyId: user.externalId || null, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || signupProfile?.name || user.username || "Bloom member" };
}

export async function provisionClerkAccount(client: SupabaseClient, account: Awaited<ReturnType<typeof verifiedClerkAccount>>) {
  const { data, error } = await client.rpc("bloom_provision_clerk_user", {
    p_subject: account.subject, p_issuer: account.issuer, p_legacy_id: account.legacyId,
    p_email: account.email, p_name: account.name,
  });
  if (error) {
    if (error.code === "23505" || error.message.includes("link")) throw authFailure(409,
      "Your existing Bloom account needs to be linked before you can continue. Please contact support; your funds are unchanged.");
    throw authFailure(503, "Unable to open your Bloom account. Please try again or contact support.");
  }
  if (!data?.id || !data.email) throw authFailure(503, "Your Bloom account is not ready yet.");
  if (!account.legacyId && account.signupProfile) {
    // Retry-safe first-time initialization only. Imported accounts and profiles
    // already filled in must never be overwritten by mutable Clerk metadata.
    const { data: initialized, error: profileError } = await client.from('users')
      .update(account.signupProfile).eq('id', data.id).eq('role', 'user')
      .is('username', null).is('first_name', null).is('last_name', null)
      .select('id,email,name').maybeSingle();
    if (profileError) throw authFailure(503, 'Unable to save your profile. Please try again.');
    if (initialized) return initialized as { id: string; email: string; name: string | null };
  }
  return data as { id: string; email: string; name: string | null };
}

export async function authenticateBloomRequest(client: SupabaseClient, token: string) {
  if (clerkAuthEnabled()) return provisionClerkAccount(client, await verifiedClerkAccount(token));
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email || !data.user.email_confirmed_at) throw authFailure(401, "Please sign in with a verified account.");
  return { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name };
}
