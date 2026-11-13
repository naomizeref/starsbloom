import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Building2, Check, Headphones, Mail, MessageCircle, Save } from "lucide-react";
import { useOrbit } from "../../../context/OrbitContext";
import type { AppSettings } from "../../../types";

const inputClass = "w-full px-4 py-3 bg-orbit-bg border border-orbit-border rounded-lg text-sm text-orbit-white placeholder:text-orbit-gray-text focus:outline-none focus:border-orbit-accent disabled:opacity-60";
const labelClass = "text-[10px] font-bold text-orbit-gray-text uppercase tracking-wider";

type FieldConfig = {
  key: keyof AppSettings;
  label: string;
  type?: string;
  optional?: boolean;
  multiline?: boolean;
  placeholder?: string;
};

const companyFields: FieldConfig[] = [
  { key: "companyName", label: "Company Name", placeholder: "Company name" },
  { key: "supportEmail", label: "Support Email", type: "email", placeholder: "support@joinbloom.online" },
  { key: "supportPhone", label: "Support Phone", type: "tel", placeholder: "+1 (000) 000-0000" },
  { key: "companyAddress", label: "Company Address", multiline: true, placeholder: "Business address" }
];

const chatFields: FieldConfig[] = [
  { key: "chatwayWidgetId", label: "Chatway Widget ID", placeholder: "vVN5iAZMVnWm" }
];

export const AdminSettingsTab: React.FC = () => {
  const { appSettings, updateAppSettings, addNotification } = useOrbit();
  const [form, setForm] = useState<AppSettings>(appSettings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setForm(appSettings);
  }, [appSettings]);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleChange = (key: keyof AppSettings, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);

    try {
      await updateAppSettings(form);
      addNotification("Business settings saved successfully.");
      showFeedback("success", "Settings saved successfully.");
    } catch {
      showFeedback("error", "Settings could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderFields = (fields: FieldConfig[]) => fields.map(field => (
    <div key={field.key} className={field.multiline ? "sm:col-span-2 space-y-2" : "space-y-2"}>
      <label className={labelClass} htmlFor={field.key}>
        {field.label}{field.optional ? " (Optional)" : ""}
      </label>
      {field.multiline ? (
        <textarea
          id={field.key}
          rows={4}
          value={form[field.key]}
          onChange={event => handleChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          disabled={saving}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          id={field.key}
          type={field.type || "text"}
          value={form[field.key]}
          onChange={event => handleChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          disabled={saving}
          className={inputClass}
        />
      )}
    </div>
  ));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="bg-orbit-card border border-orbit-border rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-orbit-white flex items-center gap-2">
            <Building2 size={20} className="text-orbit-accent" /> Settings
          </h1>
          <p className="text-xs text-orbit-gray-text mt-1">Manage business contact, email identity, and live chat configuration.</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-orbit-accent hover:bg-orbit-accent-hover text-white text-xs font-bold uppercase rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full sm:w-auto shadow-sm"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${feedback.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}
        >
          {feedback.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {feedback.message}
        </motion.div>
      )}

      <section className="bg-orbit-card border border-orbit-border rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2 text-orbit-white font-bold">
          <Headphones size={18} className="text-orbit-accent" /> Company Information
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {renderFields(companyFields)}
        </div>
      </section>

      <section className="bg-orbit-card border border-orbit-border rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2 text-orbit-white font-bold">
          <Mail size={18} className="text-orbit-accent" /> Email Settings
        </div>
        <p className="text-sm text-orbit-gray-text">
          Sending addresses, email branding, and reply routing are managed in Vercel with your verified Resend domain.
          The company details above update the website. Never enter API keys here.
        </p>
      </section>

      <section className="bg-orbit-card border border-orbit-border rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2 text-orbit-white font-bold">
          <MessageCircle size={18} className="text-orbit-accent" /> Live Chat
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {renderFields(chatFields)}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-orbit-accent hover:bg-orbit-accent-hover text-white font-bold text-xs uppercase rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full sm:w-auto shadow-md shadow-orbit-accent/20"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </motion.div>
  );
};
