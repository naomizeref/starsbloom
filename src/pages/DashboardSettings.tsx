import React, { useState } from "react";
import { useOrbit } from "../context/OrbitContext";
import { useSupabaseClient } from "../lib/supabase";

export function DashboardSettings() {
  const { user } = useOrbit();
  const supabase = useSupabaseClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (password !== confirmation) {
      setFeedback({ error: true, message: "The passwords do not match." });
      return;
    }
    setSaving(true); setFeedback(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(""); setConfirmation("");
      setFeedback({ error: false, message: "Your password has been updated." });
    } catch (error) {
      setFeedback({ error: true, message: (error as { message?: string })?.message || "Could not update your password. Please try again." });
    } finally { setSaving(false); }
  };
  const inputClass = "w-full min-h-11 rounded-xl border border-orbit-border bg-orbit-bg px-3 text-orbit-white focus:outline-none focus:ring-2 focus:ring-orbit-accent";
  return <div className="mx-auto max-w-2xl space-y-6 pb-6">
    <h1 className="text-2xl font-bold text-orbit-white">Account settings</h1>
    <section className="space-y-3 rounded-2xl border border-orbit-border bg-orbit-card p-5">
      <h2 className="font-semibold text-orbit-white">Your account</h2>
      <dl className="space-y-2 text-sm break-words">
        <div><dt className="text-orbit-gray-text">Name</dt><dd>{user.name || "Not provided"}</dd></div>
        <div><dt className="text-orbit-gray-text">Email</dt><dd>{user.email}</dd></div>
      </dl>
    </section>
    <form onSubmit={savePassword} className="space-y-4 rounded-2xl border border-orbit-border bg-orbit-card p-5">
      <h2 className="font-semibold text-orbit-white">Change password</h2>
      <p className="text-sm text-orbit-gray-text">Use at least 8 characters. Additional account security requirements may apply.</p>
      <div className="space-y-2"><label htmlFor="new-password" className="text-sm">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} disabled={saving} className={inputClass} /></div>
      <div className="space-y-2"><label htmlFor="confirm-password" className="text-sm">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={saving} className={inputClass} /></div>
      {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-red-400" : "text-emerald-400"}`}>{feedback.message}</p>}
      <button disabled={saving} className="min-h-11 rounded-xl bg-orbit-accent px-5 font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Update password"}</button>
    </form>
  </div>;
}
