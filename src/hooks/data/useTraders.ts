import { useCallback } from "react";
import { useRemoteRows } from "./useRemoteRows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TraderProfile } from "../../types";
// Maps between Supabase's snake_case `traders` rows and the app's TraderProfile shape.
function traderRowToProfile(row: any): TraderProfile {
  // Match the RPC: canonical NULL/zero means no configured limit. Only use
  // legacy aliases when the canonical columns are absent, never to override NULL.
  const minCopy = row.min_copy_amount === undefined ? row.minimum_copy_amount : row.min_copy_amount;
  const maxCopy = row.max_copy_amount === undefined ? row.maximum_copy_amount : row.max_copy_amount;

  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    active: row.active,
    featured: row.featured,
    country: row.country,
    tradingStyle: row.trading_style,
    markets: row.markets,
    minimumCopyAmount: minCopy == null ? 0 : Number(minCopy),
    maximumCopyAmount: maxCopy && maxCopy > 0 ? maxCopy : undefined,
    biography: row.biography,
    displayOrder: row.display_order,
    roi: Number(row.roi ?? 0),
    winRate: row.win_rate,
    followers: row.followers,
    maxFollowers: Number(row.max_followers ?? 0),
    assetsUnderManagement: row.assets_under_management,
    riskScore: row.risk_score,
    profitDays: Number(row.profit_days ?? 30),
    chartData: row.chart_data || []
  };
}

function traderProfileToRow(trader: Partial<TraderProfile>): Record<string, any> {
  const row: Record<string, any> = {};
  if (trader.name !== undefined) row.name = trader.name;
  if (trader.avatar !== undefined) row.avatar = trader.avatar;
  if (trader.active !== undefined) row.active = trader.active;
  if (trader.featured !== undefined) row.featured = trader.featured;
  if (trader.country !== undefined) row.country = trader.country;
  if (trader.tradingStyle !== undefined) row.trading_style = trader.tradingStyle;
  if (trader.markets !== undefined) row.markets = trader.markets;
  if (trader.minimumCopyAmount !== undefined) row.min_copy_amount = row.minimum_copy_amount = trader.minimumCopyAmount;
  if (trader.maximumCopyAmount !== undefined) row.max_copy_amount = row.maximum_copy_amount = trader.maximumCopyAmount;
  if (trader.biography !== undefined) row.biography = trader.biography;
  if (trader.displayOrder !== undefined) row.display_order = trader.displayOrder;
  if (trader.roi !== undefined) row.roi = trader.roi;
  if (trader.winRate !== undefined) row.win_rate = trader.winRate;
  if (trader.followers !== undefined) row.followers = trader.followers;
  if (trader.maxFollowers !== undefined) row.max_followers = trader.maxFollowers;
  if (trader.assetsUnderManagement !== undefined) row.assets_under_management = trader.assetsUnderManagement;
  if (trader.riskScore !== undefined) row.risk_score = trader.riskScore;
  if (trader.profitDays !== undefined) row.profit_days = trader.profitDays;
  if (trader.chartData !== undefined) row.chart_data = trader.chartData;
  return row;
}

/**
 * Trader catalog for copy trading — admin-managed, publicly readable.
 * Backed entirely by Supabase's `traders` table. No Firebase.
 */
export function useTraders(supabase: SupabaseClient, authReady: boolean, isAdmin: boolean, addNotification: (message: string) => void, enabled = true) {
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("traders").select("*").order("display_order", { ascending: true });
    if (error) throw error;
    return (data || []).map(traderRowToProfile);
  }, [supabase]);
  const catalog = useRemoteRows<TraderProfile>(enabled ? `traders:${authReady}:${isAdmin}` : null, load, "traders");
  const assertAdmin = () => { if (!authReady || !isAdmin) throw new Error("Admin permission is required to manage traders."); };
  const adminUpdateTrader = async (id: string, updated: Partial<TraderProfile>) => {
    assertAdmin();
    const { data, error } = await supabase.from("traders").update(traderProfileToRow(updated)).eq("id", id).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("Trader update was not confirmed. Refresh before retrying.");
    await catalog.refresh();
    addNotification("Trader updated successfully.");
  };
  const adminCreateTrader = async (trader: Omit<TraderProfile, "id">) => {
    assertAdmin();
    const { data, error } = await supabase.from("traders").insert({ id: `trader-${crypto.randomUUID()}`, ...traderProfileToRow(trader) }).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("Trader creation was not confirmed. Refresh before retrying.");
    await catalog.refresh();
    addNotification("Trader created successfully.");
  };
  const adminDeleteTrader = async (id: string) => {
    assertAdmin();
    const { data, error } = await supabase.from("traders").delete().eq("id", id).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("Trader deletion was not confirmed. Refresh before retrying.");
    await catalog.refresh();
    addNotification("Trader deleted successfully.");
  };
  return { traders: catalog.rows, tradersError: catalog.error, tradersLoading: catalog.loading, refreshTraders: catalog.refresh, adminCreateTrader, adminUpdateTrader, adminDeleteTrader };
}
