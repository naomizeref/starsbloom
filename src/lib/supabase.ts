import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';

import { CLERK_ENABLED } from './authConfig';
import { getClerkToken } from './authRuntime';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase env vars in .env');
}

/**
 * Singleton Supabase Client with full auth & session persistence.
 * Uses browser localStorage to automatically persist session tokens,
 * refresh tokens on expiration, and detect OAuth redirect tokens in URL.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  ...(CLERK_ENABLED ? { accessToken: getClerkToken } : {}),
  auth: {
    persistSession: !CLERK_ENABLED,
    autoRefreshToken: !CLERK_ENABLED,
    detectSessionInUrl: !CLERK_ENABLED,
    storage: window.localStorage,
  },
});

/**
 * Hook: Returns the singleton Supabase client.
 */
export function useSupabaseClient(): SupabaseClient {
  return supabase;
}

/**
 * Plain client for contexts with no signed-in user (aliases to singleton client).
 */
export const supabasePublic = supabase;

/**
 * Returns the authenticated Supabase client singleton.
 */
export function createFreshAuthedClient(): SupabaseClient {
  return supabase;
}

/**
 * Ensures a Supabase auth user has a matching row in the `users` table.
 * Safe to call repeatedly (upsert with ignoreDuplicates).
 */
export async function ensureUserRow(
  supabaseClient: SupabaseClient,
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    user_metadata?: Record<string, any> | null;
  }
) {
  // Clerk accounts are provisioned by the verified server endpoint.
  if (CLERK_ENABLED) return;
  const email = user.email || user.user_metadata?.email || '';
  const name =
    user.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (email ? email.split('@')[0] : '');

  const { error } = await supabaseClient.from('users').upsert(
    {
      id: user.id,
      email,
      name,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (error) console.error('ensureUserRow error:', error);
}

export interface NewUserProfile {
  id: string;
  email: string;
  name: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  phone?: string;
  accountType?: string;
  country?: string;
  currency?: string;
}

export async function createUserProfile(supabaseClient: SupabaseClient, profile: NewUserProfile) {
  const { error } = await supabaseClient.from('users').upsert(
    {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      username: profile.username ?? null,
      first_name: profile.firstName ?? null,
      last_name: profile.lastName ?? null,
      gender: profile.gender ?? null,
      phone: profile.phone ?? null,
      account_type: profile.accountType ?? 'Bronze',
      country: profile.country ?? null,
      currency: profile.currency ?? 'USD',
    },
    { onConflict: 'id' }
  );

  if (error) console.error('createUserProfile error:', error);
  return { error };
}

export { uploadDepositProof } from "../services/depositProofService";

export async function uploadDepositWalletQrCode(supabaseClient: SupabaseClient, walletId: string, file: File): Promise<string> {
  const path = `${walletId}_${Date.now()}_${file.name}`;
  const { error } = await supabaseClient.storage.from('deposit-wallet-qr').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('deposit-wallet-qr').getPublicUrl(path);
  return data.publicUrl;
}