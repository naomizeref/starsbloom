import { useCallback } from "react";
import { useRemoteRows } from "./useRemoteRows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortfolioAsset } from "../../types";

function rowToAsset(row: any): PortfolioAsset {
  return {
    symbol: row.symbol,
    name: row.name,
    amount: row.amount,
    avgBuyPrice: row.avg_buy_price,
    currentPrice: row.current_price,
    type: row.type
  };
}

/**
 * Portfolio holdings (the buy/sell trading feature). Backed entirely by
 * Supabase's `portfolio_assets` table via atomic buy_asset/sell_asset RPCs
 * — balance debit/credit, holding update, and transaction record all
 * happen together or not at all.
 */
export function usePortfolio(supabase: SupabaseClient, authReady: boolean, currentUserId: string | null) {
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("portfolio_assets").select("*").eq("user_id", currentUserId!);
    // A missing table is a compatibility failure, not an empty portfolio.
    // Do not combine legacy holdings automatically or risk double-counting them.
    if (error) throw error;
    return (data || []).map(rowToAsset);
  }, [supabase, currentUserId]);
  const holdings = useRemoteRows<PortfolioAsset>(authReady ? currentUserId : null, load, "portfolio holdings");
  const refreshPortfolio = holdings.refresh;

  const buyAsset = async (
    symbol: string, name: string, amount: number, price: number, quantity: number, assetType: "crypto" | "stock"
  ) => {
    if (!currentUserId) throw new Error("You must be signed in to trade.");
    const { error } = await supabase.rpc("buy_asset", {
      p_user_id: currentUserId,
      p_symbol: symbol,
      p_name: name,
      p_amount: amount,
      p_price: price,
      p_quantity: quantity,
      p_asset_type: assetType
    });
    if (error) throw error;
    await refreshPortfolio();
  };

  const sellAsset = async (symbol: string, amount: number, price: number, quantity: number) => {
    if (!currentUserId) throw new Error("You must be signed in to trade.");
    const { error } = await supabase.rpc("sell_asset", {
      p_user_id: currentUserId,
      p_symbol: symbol,
      p_amount: amount,
      p_price: price,
      p_quantity: quantity
    });
    if (error) throw error;
    await refreshPortfolio();
  };

  return { portfolio: holdings.rows, portfolioError: holdings.error, portfolioLoading: holdings.loading, buyAsset, sellAsset, refreshPortfolio };
}