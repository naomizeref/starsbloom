import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeNotification, type NotificationItem } from "../../services/notificationsService";

function rowToNotification(row: any): NotificationItem {
  return normalizeNotification({
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    timestamp: row.timestamp,
    read: row.read,
    recipientEmail: row.recipient_email,
    audience: row.audience || undefined,
    eventKey: row.event_key || undefined,
    action: row.action || undefined
  }, row.id);
}

function notificationToRow(notification: NotificationItem): Record<string, any> {
  return {
    id: notification.id,
    recipient_email: notification.recipientEmail || "",
    title: notification.title,
    message: notification.message,
    type: notification.type,
    audience: notification.audience || null,
    read: notification.read,
    event_key: notification.eventKey || null,
    action: notification.action || null
  };
}

export function useNotifications(supabase: SupabaseClient) {
  const fetchNotifications = async (recipientEmail: string, userId?: string): Promise<NotificationItem[]> => {
    if (!recipientEmail && !userId) return [];
    const queries = [];
    if (recipientEmail) queries.push(supabase.from("notifications").select("*")
      .ilike("recipient_email", recipientEmail.replace(/[\\%_]/g, "\\$&"))
      .order("created_at", { ascending: false }));
    if (userId) queries.push(supabase.from("notifications").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false }));
    const results = await Promise.all(queries);
    const unique = new Map<string, NotificationItem>();
    for (const { data, error } of results) {
      if (error) throw error;
      for (const row of data || []) unique.set(row.id, rowToNotification(row));
    }
    return [...unique.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  };

  const saveNotificationToDb = async (notification: NotificationItem) => {
    const { error } = await supabase.from("notifications").upsert(notificationToRow(notification), { onConflict: "id" });
    if (error) throw error;
  };

  const markReadInDb = async (notificationId: string) => {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", notificationId);
    if (error) throw error;
  };

  const markManyReadInDb = async (notificationIds: string[]) => {
    const { error } = await supabase.from("notifications").update({ read: true }).in("id", notificationIds);
    if (error) throw error;
  };

  const deleteNotificationInDb = async (notificationId: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
    if (error) throw error;
  };

  return { fetchNotifications, saveNotificationToDb, markReadInDb, markManyReadInDb, deleteNotificationInDb };
}
