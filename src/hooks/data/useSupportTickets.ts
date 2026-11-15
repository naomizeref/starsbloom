import { useCallback } from "react";
import { useRemoteRows } from "./useRemoteRows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportTicket, SupportTicketMessage, TicketCategory, TicketPriority } from "../../types";
import { USE_MOCK_DATA } from "../../services";

export interface AdminSupportTicket extends SupportTicket {
  userId: string;
  userName: string;
}

function rowToTicket(row: any): SupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    status: row.status,
    date: (row.created_at || "").split("T")[0],
    priority: row.priority,
    messages: Array.isArray(row.messages) ? row.messages as SupportTicketMessage[] : []
  };
}

/**
 * Support tickets. Backed entirely by Supabase's `support_tickets` table.
 * Ticket creation is a plain RLS-gated insert (no balance involved). Every
 * mutation after creation (user reply, support reply, close, priority)
 * goes through a security-definer RPC so the `messages` array is appended
 * atomically instead of via a client-side read-modify-write.
 */
export function useSupportTickets(
  supabase: SupabaseClient,
  authReady: boolean,
  currentUserId: string | null,
  isAdmin: boolean
) {
  const loadMine = useCallback(async () => {
    const { data, error } = await supabase.from("support_tickets").select("*").eq("user_id", currentUserId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToTicket);
  }, [supabase, currentUserId]);
  const loadAll = useCallback(async () => {
    const { data, error } = await supabase.from("support_tickets").select("*, users!inner(email, name)").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({ ...rowToTicket(row), userId: row.user_id, userName: row.users?.name || "", userEmail: row.users?.email || "" }));
  }, [supabase]);
  const scope = !USE_MOCK_DATA && authReady ? currentUserId : null;
  const mine = useRemoteRows<SupportTicket>(scope, loadMine, "support tickets");
  const all = useRemoteRows<AdminSupportTicket>(scope && isAdmin ? scope : null, loadAll, "support ticket queue");
  const myTickets = mine.rows;
  const allTickets = all.rows;
  const refreshMyTickets = mine.refresh;
  const refreshAllTickets = all.refresh;

  const createTicket = async (
    subject: string,
    category: TicketCategory,
    initialMsg: string,
    priority: TicketPriority = "medium"
  ) => {
    if (!currentUserId) throw new Error("You must be signed in to open a support ticket.");

    const id = `tkt-${currentUserId}-${Date.now()}`;
    const messages: SupportTicketMessage[] = [{ sender: "user", text: initialMsg, time: "Just Now" }];

    const { error } = await supabase.from("support_tickets").insert({
      id,
      user_id: currentUserId,
      subject,
      category,
      status: "open",
      priority,
      messages
    });
    if (error) throw error;

    await refreshMyTickets();
    return id;
  };

  const replyToTicket = async (ticketId: string, text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const { error } = await supabase.rpc("reply_to_ticket", { p_ticket_id: ticketId, p_text: text, p_time: time });
    if (error) throw error;
    await refreshMyTickets();
  };

  const replyToTicketAsSupport = async (ticketId: string, text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const { error } = await supabase.rpc("reply_to_ticket_as_support", { p_ticket_id: ticketId, p_text: text, p_time: time });
    if (error) throw error;
    await Promise.all([refreshMyTickets(), refreshAllTickets()]);
  };

  const closeTicket = async (ticketId: string) => {
    const { error } = await supabase.rpc("close_ticket", { p_ticket_id: ticketId });
    if (error) throw error;
    await Promise.all([refreshMyTickets(), refreshAllTickets()]);
  };

  const setTicketPriority = async (ticketId: string, priority: TicketPriority) => {
    const { error } = await supabase.rpc("set_ticket_priority", { p_ticket_id: ticketId, p_priority: priority });
    if (error) throw error;
    await Promise.all([refreshMyTickets(), refreshAllTickets()]);
  };

  return {
    myTickets,
    allTickets,
    supportError: isAdmin ? all.error : mine.error,
    supportLoading: isAdmin ? all.loading : mine.loading,
    refreshSupport: isAdmin ? all.refresh : mine.refresh,
    createTicket,
    replyToTicket,
    replyToTicketAsSupport,
    closeTicket,
    setTicketPriority,
    refreshAllTickets
  };
}
