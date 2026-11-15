import { useCallback } from "react";
import { useRemoteRows } from "./useRemoteRows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvestmentPlan } from "../../types";
import { sortInvestmentPlans, normalizeInvestmentPlan } from "../../services";

function rowToPlan(row: any): InvestmentPlan {
  return normalizeInvestmentPlan(row.id, {
    name: row.name,
    minDeposit: row.min_deposit,
    maxDeposit: row.max_deposit,
    durationDays: row.duration_days,
    roiPercent: row.roi_percent,
    roiCapPercent: row.roi_cap_percent,
    description: row.description,
    status: row.status,
    enabled: row.enabled,
    displayOrder: row.display_order,
    badge: row.badge,
    accentColor: row.accent_color
  });
}

function planToRow(plan: InvestmentPlan): Record<string, any> {
  return {
    id: plan.id,
    name: plan.name,
    min_deposit: plan.minDeposit,
    max_deposit: plan.maxDeposit,
    duration_days: plan.durationDays,
    roi_percent: plan.roiPercent,
    roi_cap_percent: plan.roiCapPercent ?? null,
    description: plan.description,
    status: plan.status,
    enabled: plan.enabled,
    display_order: plan.displayOrder,
    badge: plan.badge || null,
    accent_color: plan.accentColor || null
  };
}

/**
 * Investment plan catalog (admin-configurable templates). Backed entirely
 * by Supabase's `investment_plans` table — public read, admin write. No
 * Firebase. Purchasing/claiming/topping-up an investment is a separate,
 * already-migrated concern (see useActiveInvestments.ts).
 */
export function useInvestmentPlans(supabase: SupabaseClient, enabled = true) {
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("investment_plans").select("*").order("display_order", { ascending: true });
    if (error) throw error;
    return sortInvestmentPlans((data || []).map(rowToPlan));
  }, [supabase]);
  const catalog = useRemoteRows<InvestmentPlan>(enabled ? "catalog" : null, load, "investment plans");

  const createPlan = async (planInput: Omit<InvestmentPlan, "id">) => {
    const freshPlan = normalizeInvestmentPlan(`plan-${crypto.randomUUID()}`, planInput);
    const { data, error } = await supabase.from("investment_plans").insert(planToRow(freshPlan)).select("*").single();
    if (error) throw error;
    if (!data) throw new Error("Plan creation was not confirmed. Refresh the catalog before retrying.");
    await catalog.refresh();
    return rowToPlan(data);
  };

  const savePlan = async (updated: InvestmentPlan) => {
    const normalized = normalizeInvestmentPlan(updated.id, updated);
    const { data, error } = await supabase.from("investment_plans").update(planToRow(normalized)).eq("id", normalized.id).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("Plan was not updated. Check your permissions and refresh the catalog.");
    await catalog.refresh();
  };

  const deletePlan = async (planId: string) => {
    const { data, error } = await supabase.from("investment_plans").delete().eq("id", planId).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("Plan was not deleted. Check your permissions and refresh the catalog.");
    await catalog.refresh();
  };

  const setPlanEnabled = async (planId: string, enabled: boolean) => {
    const { data, error } = await supabase.from("investment_plans").update({ enabled, status: enabled ? "active" : "paused" }).eq("id", planId).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("Plan status was not updated. Check your permissions and refresh the catalog.");
    await catalog.refresh();
  };

  return { plans: catalog.rows, plansLoading: catalog.loading, plansError: catalog.error, refreshPlans: catalog.refresh, createPlan, savePlan, deletePlan, setPlanEnabled };
}
