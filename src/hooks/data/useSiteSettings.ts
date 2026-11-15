import { useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContent, AppSettings } from "../../types";
import {
  USE_MOCK_DATA,
  loadLocalAppSettings,
  saveLocalAppSettings,
  mergeAppSettings,
  normalizeAppSettings,
  DEFAULT_SITE_CONTENT
} from "../../services";

/** Supabase error code when a table doesn't exist in the schema cache */
const TABLE_NOT_FOUND = "PGRST205";

/**
 * Site-wide content (marketing copy) and business settings (support email,
 * Chatway widget ID, etc). Backed entirely by Supabase's `site_content` and
 * `app_settings` tables — singleton rows keyed by `key`. No Firebase.
 */
export function useSiteSettings(supabase: SupabaseClient) {
  const [siteContent, setSiteContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadLocalAppSettings());

  const updateSiteContent = async (newContent: Partial<SiteContent>) => {
    const merged = { ...siteContent, ...newContent };
    if (USE_MOCK_DATA) { setSiteContent(merged); return; }

    try {
      const { error } = await supabase
        .from("site_content")
        .upsert({ key: "texts", value: merged }, { onConflict: "key" }).select("key").single();
      if (error) throw error;
      setSiteContent(merged);
    } catch (error) {
      console.error("Failed to update site content:", error);
      throw error;
    }
  };

  const updateAppSettings = async (settings: Partial<AppSettings>) => {
    const nextSettings = mergeAppSettings(appSettings, settings);
    if (USE_MOCK_DATA) { setAppSettings(nextSettings); saveLocalAppSettings(nextSettings); return; }

    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "business", value: nextSettings }, { onConflict: "key" }).select("key").single();
      if (error) throw error;
      setAppSettings(nextSettings);
      saveLocalAppSettings(nextSettings);
    } catch (error) {
      console.error("Failed to update app settings:", error);
      throw error;
    }
  };

  useEffect(() => {
    if (USE_MOCK_DATA) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("site_content")
        .select("value")
        .eq("key", "texts")
        .maybeSingle();

      if (!cancelled) {
        if (error && error.code !== TABLE_NOT_FOUND) {
          console.error("Failed to load site content:", error);
        } else if (data) {
          setSiteContent(prev => ({ ...prev, ...(data.value as Partial<SiteContent>) }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (USE_MOCK_DATA) {
      setAppSettings(loadLocalAppSettings());
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "business")
        .maybeSingle();

      if (!cancelled) {
        if (error && error.code !== TABLE_NOT_FOUND) {
          console.error("Failed to load app settings:", error);
        } else if (data) {
          const nextSettings = normalizeAppSettings(data.value as Partial<AppSettings>);
          setAppSettings(nextSettings);
          saveLocalAppSettings(nextSettings);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { siteContent, appSettings, updateSiteContent, updateAppSettings };
}