import { useState, useEffect, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DepositWallet } from "../../types";
import {
  USE_MOCK_DATA,
  getMockDepositWallets,
  saveMockDepositWallet,
  deleteMockDepositWallet,
  buildDepositWallet,
  getEnabledDepositWallets,
  mapDepositWalletsToAddressBook
} from "../../services";

function walletRowToItem(row: any): DepositWallet {
  return {
    id: row.id,
    coinName: row.coin_name,
    network: row.network,
    walletAddress: row.wallet_address,
    qrCodeUrl: row.qr_code_url,
    minimumDeposit: row.minimum_deposit,
    enabled: row.enabled,
    displayOrder: row.display_order,
    // The live schema column is `instructions` (supabase_schema.sql), NOT
    // `deposit_instructions`. Reading the wrong name silently yielded undefined.
    depositInstructions: row.instructions ?? ""
  };
}

function walletToRow(wallet: DepositWallet): Record<string, any> {
  return {
    id: wallet.id,
    coin_name: wallet.coinName,
    network: wallet.network,
    wallet_address: wallet.walletAddress,
    qr_code_url: wallet.qrCodeUrl,
    minimum_deposit: wallet.minimumDeposit,
    enabled: wallet.enabled,
    display_order: wallet.displayOrder,
    // Must match the live column name (`instructions`). Writing
    // `deposit_instructions` made every upsert fail with "column ... does not
    // exist" (PGRST204) while the UI optimistically reported success — the
    // root cause of wallets saving locally but never reaching other users.
    instructions: wallet.depositInstructions ?? ""
  };
}

/**
 * Admin-managed crypto deposit wallet addresses. Backed entirely by
 * Supabase's `deposit_wallets` table. No Firebase.
 */
export function useDepositWallets(supabase: SupabaseClient, authReady: boolean, isLoggedIn: boolean) {
  const [depositWallets, setDepositWallets] = useState<DepositWallet[]>(() => getMockDepositWallets());
  const enabledDepositWallets = useMemo(() => getEnabledDepositWallets(depositWallets), [depositWallets]);
  const adminWallets = useMemo(() => mapDepositWalletsToAddressBook(depositWallets), [depositWallets]);

  useEffect(() => {
    if (USE_MOCK_DATA) {
      setDepositWallets(getMockDepositWallets());
      return;
    }

    if (!authReady || !isLoggedIn) {
      setDepositWallets([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const STORAGE_KEY = "bloom_deposit_wallets_cache";

      const { data, error } = await supabase
        .from("deposit_wallets")
        .select("*")
        .order("display_order", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn("Supabase deposit_wallets query fallback to cache:", error.message);
        try {
          const cached = localStorage.getItem(STORAGE_KEY);
          if (cached) setDepositWallets(JSON.parse(cached));
        } catch {}
        return;
      }

      if (data && data.length > 0) {
        const mapped = data.map(walletRowToItem);
        setDepositWallets(mapped);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)); } catch {}
      }
    })();

    return () => { cancelled = true; };
  }, [supabase, authReady, isLoggedIn]);

  const saveDepositWallet = async (walletInput: DepositWallet | Omit<DepositWallet, "id">) => {
    const wallet = buildDepositWallet(walletInput as DepositWallet & { id?: string });

    setDepositWallets(prev => {
      const exists = prev.some(item => item.id === wallet.id);
      const next = exists ? prev.map(item => item.id === wallet.id ? wallet : item) : [...prev, wallet];
      try { localStorage.setItem("bloom_deposit_wallets_cache", JSON.stringify(next)); } catch {}
      return next;
    });

    // supabase-js resolves API-level rejections (RLS denial, unknown column,
    // 4xx/5xx) as { error } — it does NOT throw, so the old try/catch never
    // fired: failed saves looked successful locally while nothing reached the
    // database. Surface the error so the admin UI can show it.
    const { error } = await supabase
      .from("deposit_wallets")
      .upsert(walletToRow(wallet), { onConflict: "id" });

    if (error) {
      console.error("Failed to save deposit wallet to Supabase:", error.message);
      throw new Error(`Could not save the deposit wallet: ${error.message}`);
    }
    return wallet;
  };

  const deleteDepositWallet = async (walletId: string) => {
    setDepositWallets(prev => {
      const next = prev.filter(item => item.id !== walletId);
      try { localStorage.setItem("bloom_deposit_wallets_cache", JSON.stringify(next)); } catch {}
      return next;
    });

    const { error } = await supabase.from("deposit_wallets").delete().eq("id", walletId);

    if (error) {
      console.error(`Failed to delete deposit wallet ${walletId} from Supabase:`, error.message);
      throw new Error(`Could not delete the deposit wallet: ${error.message}`);
    }
  };

  return { depositWallets, enabledDepositWallets, adminWallets, saveDepositWallet, deleteDepositWallet };
}