import type { SupabaseClient, User } from "@supabase/supabase-js";
import { CLERK_ENABLED } from "./authConfig";

type ClerkRuntime = { user: User | null; getToken: () => Promise<string | null>; signOut: () => Promise<void> };
let runtime: ClerkRuntime | null = null;

// Tokens stay in Clerk's session manager; never copy them into localStorage.
export function installClerkRuntime(next: ClerkRuntime) {
  runtime = next;
  return () => { if (runtime === next) runtime = null; };
}
export async function getClerkToken() { return runtime?.getToken() ?? null; }
export async function getBloomUser(client: SupabaseClient): Promise<User | null> {
  if (CLERK_ENABLED) return runtime?.user ?? null;
  return (await client.auth.getUser()).data.user;
}
export async function getBloomCredentials(client: SupabaseClient) {
  if (CLERK_ENABLED) return { token: await getClerkToken(), userId: runtime?.user?.id };
  const { data: { session } } = await client.auth.getSession();
  return { token: session?.access_token, userId: session?.user.id };
}
export async function signOutBloom(client: SupabaseClient) {
  if (CLERK_ENABLED) {
    if (!runtime) throw new Error("Account security is still loading. Please try again.");
    await runtime.signOut();
  } else {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
}
