import React, { useState, useEffect } from "react";
import { useOrbit } from "../../../context/OrbitContext";
import { motion } from "motion/react";
import { PenTool, Save, Check, RotateCcw } from "lucide-react";
import { DEFAULT_SITE_CONTENT } from "../../../context/OrbitContext";

export const AdminContentTab: React.FC = () => {
  const { siteContent, updateSiteContent } = useOrbit();
  const [form, setForm] = useState({ ...siteContent });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setForm({ ...siteContent }); }, [siteContent, dirty]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSiteContent(form);
      setSaveError(false);
      setDirty(false);
      setFeedback("Content saved successfully!");
    } catch {
      setSaveError(true);
      setFeedback("Failed to save content.");
    }
    setSaving(false);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleReset = () => {
    setSaveError(false);
    setDirty(true);
    setForm({ ...DEFAULT_SITE_CONTENT });
    setFeedback("Form reset to defaults (not saved yet).");
    setTimeout(() => setFeedback(null), 3000);
  };

  const fields = [
    { key: "hero_title", label: "Hero Title", rows: 1 },
    { key: "hero_subtitle", label: "Hero Subtitle", rows: 1 },
    { key: "hero_button", label: "Hero Button Text", rows: 1 },
    { key: "dashboard_title", label: "Dashboard Title", rows: 1 },
    { key: "dashboard_description", label: "Dashboard Description", rows: 2 },
    { key: "investment_title", label: "Investment Page Title", rows: 1 },
    { key: "investment_description", label: "Investment Page Description", rows: 2 },
    { key: "footer_text", label: "Footer Text", rows: 2 },
    { key: "announcement_text", label: "Announcement Banner Text", rows: 2 },
    { key: "faq_question_1", label: "FAQ Question 1", rows: 1 },
    { key: "faq_answer_1", label: "FAQ Answer 1", rows: 2 },
    { key: "faq_question_2", label: "FAQ Question 2", rows: 1 },
    { key: "faq_answer_2", label: "FAQ Answer 2", rows: 2 },
    { key: "faq_question_3", label: "FAQ Question 3", rows: 1 },
    { key: "faq_answer_3", label: "FAQ Answer 3", rows: 2 },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="space-y-6">
      {/* Header */}
      <div className="bg-orbit-card border border-orbit-border rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-orbit-white flex items-center gap-2">
            <PenTool size={20} className="text-orbit-accent" /> Content Editor
          </h1>
          <p className="text-xs text-orbit-gray-text mt-1">Edit text used by the application. The homepage has its own design and content.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-orbit-border/50 border border-orbit-border text-orbit-gray-text text-xs font-bold rounded-lg hover:text-orbit-white cursor-pointer">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-orbit-accent hover:bg-orbit-accent-hover text-white text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-sm">
            <Save size={12} /> {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} role={saveError ? "alert" : "status"} className={`p-3 rounded-xl border text-xs font-bold ${saveError ? "text-red-400 border-red-500/30" : "text-emerald-400 border-emerald-500/30"}`}>
          {feedback}
        </motion.div>
      )}

      {/* Fields */}
      <div className="space-y-4">
        {fields.map(field => (
          <div key={field.key} className="bg-orbit-card border border-orbit-border rounded-xl p-4 space-y-2">
            <label htmlFor={field.key} className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">{field.label}</label>
            {field.rows > 1 ? (
              <textarea
                id={field.key} disabled={saving}
                rows={field.rows}
                value={(form as any)[field.key] || ""}
                onChange={e => (setDirty(true), setForm(prev => ({ ...prev, [field.key]: e.target.value })))}
                className="w-full px-4 py-2.5 bg-orbit-bg border border-orbit-border rounded-lg text-sm text-orbit-white placeholder:text-orbit-gray-text focus:outline-none focus:border-orbit-accent resize-none"
              />
            ) : (
              <input
                id={field.key} disabled={saving}
                value={(form as any)[field.key] || ""}
                onChange={e => (setDirty(true), setForm(prev => ({ ...prev, [field.key]: e.target.value })))}
                className="w-full px-4 py-2.5 bg-orbit-bg border border-orbit-border rounded-lg text-sm text-orbit-white placeholder:text-orbit-gray-text focus:outline-none focus:border-orbit-accent"
              />
            )}
          </div>
        ))}
      </div>

      {/* Bottom Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-8 py-3 bg-orbit-accent hover:bg-orbit-accent-hover text-white font-bold text-xs uppercase rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-md shadow-orbit-accent/20">
          <Save size={14} /> {saving ? "Saving..." : "Save All Changes"}
        </button>
      </div>
    </motion.div>
  );
};
