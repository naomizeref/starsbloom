import { getBloomUser } from "../../lib/authRuntime";
import { useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WalletFeedback } from "../../types";
import { USE_MOCK_DATA } from "../../services";

function rowToFeedback(row: any): WalletFeedback {
  return {
    id: row.id,
    userEmail: row.user_email,
    userName: row.user_name,
    wallet: row.wallet,
    reason: row.reason,
    wouldUse: row.would_use,
    status: row.status,
    adminNotes: row.admin_notes,
    createdAt: row.created_at
  };
}

/**
 * Wallet-support requests submitted by users. Backed entirely by
 * Supabase's `wallet_feedback` table.
 */
export function useWalletFeedback(
  supabase: SupabaseClient,
  authReady: boolean,
  isLoggedIn: boolean,
  isAdmin: boolean
) {
  const [walletFeedback, setWalletFeedback] = useState<WalletFeedback[]>([]);

  useEffect(() => {
    if (USE_MOCK_DATA) {
      setWalletFeedback([]);
      return;
    }

    if (!authReady || !isLoggedIn) {
      setWalletFeedback([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const user = await getBloomUser(supabase);
      if (!user?.id) return;
      let query = supabase.from("wallet_feedback").select("*");
      if (!isAdmin && user?.id) {
        query = query.eq("user_id", user.id);
      }
      const { data, error } = await query;

      if (cancelled) return;
      if (error) {
        console.error("Failed to load wallet feedback:", error);
        return;
      }
      setWalletFeedback((data || []).map(rowToFeedback));
    })();

    return () => { cancelled = true; };
  }, [authReady, isLoggedIn, isAdmin, supabase]);

  const submitWalletFeedback = async (wallet: string, reason: string, wouldUse: boolean) => {
    if (USE_MOCK_DATA) return;
    const user = await getBloomUser(supabase);
    if (!user?.id) throw new Error("Please sign in before submitting feedback.");

    const userEmail = user.email || "";
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || userEmail.split("@")[0];

    const isDuplicate = walletFeedback.some(
      fb => fb.userEmail === userEmail && fb.wallet === wallet && fb.reason === reason
    );
    if (isDuplicate) return { duplicate: true };

    const newFeedback = {
      user_id: user.id,
      user_email: userEmail,
      user_name: userName,
      wallet,
      reason,
      would_use: wouldUse,
      status: "new"
    };

    const { data, error } = await supabase
      .from("wallet_feedback")
      .insert(newFeedback)
      .select()
      .single();

    if (error) throw error;

    setWalletFeedback(prev => [rowToFeedback(data), ...prev]);
    return { duplicate: false };
  };

  const adminUpdateWalletFeedback = async (id: string, status: "new" | "reviewed", adminNotes?: string) => {
    if (USE_MOCK_DATA) return;

    const updateData: Record<string, any> = { status };
    if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

    const { error } = await supabase.from("wallet_feedback").update(updateData).eq("id", id).select("id").single();
    if (error) throw error;

    setWalletFeedback(prev => prev.map(fb => fb.id === id ? { ...fb, status, adminNotes: adminNotes ?? fb.adminNotes } : fb));
  };

  const adminDeleteWalletFeedback = async (id: string) => {
    if (USE_MOCK_DATA) return;

    const { error } = await supabase.from("wallet_feedback").delete().eq("id", id).select("id").single();
    if (error) throw error;

    setWalletFeedback(prev => prev.filter(fb => fb.id !== id));
  };

  return { walletFeedback, submitWalletFeedback, adminUpdateWalletFeedback, adminDeleteWalletFeedback };
}