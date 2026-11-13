-- =============================================================================
-- MIGRATION: Create app_settings and site_content tables
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SITE_CONTENT TABLE
-- Stores site-wide marketing copy (hero text, FAQs, footer, etc.)
-- Singleton row keyed by `key` (e.g. key = 'texts')
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- Everyone can read site content; only admins can write
alter table public.site_content enable row level security;

create policy "Anyone can read site_content"
  on public.site_content for select
  using (true);

create policy "Admins can insert site_content"
  on public.site_content for insert
  with check (public.is_admin());

create policy "Admins can update site_content"
  on public.site_content for update
  using (public.is_admin());

create policy "Admins can delete site_content"
  on public.site_content for delete
  using (public.is_admin());

-- Seed default row so the app has content on first load
insert into public.site_content (key, value)
values (
  'texts',
  '{
    "hero_title":             "Grow Your Wealth with Bloom",
    "hero_subtitle":          "Start investing today with expert-guided plans",
    "hero_button":            "Get Started",
    "dashboard_title":        "Dashboard",
    "dashboard_description":  "Manage your investments and track performance",
    "investment_title":       "Investment Plans",
    "investment_description": "Choose from our curated investment plans",
    "footer_text":            "© 2026 Bloom. All rights reserved.",
    "announcement_text":      "",
    "faq_question_1":         "How do I get started?",
    "faq_answer_1":           "Create an account and choose an investment plan.",
    "faq_question_2":         "Is my money safe?",
    "faq_answer_2":           "We use industry-standard security practices.",
    "faq_question_3":         "How do I withdraw?",
    "faq_answer_3":           "Navigate to your wallet and submit a withdrawal request."
  }'::jsonb
)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. APP_SETTINGS TABLE
-- Stores business configuration (company name, support info, widget IDs, etc.)
-- Singleton row keyed by `key` (e.g. key = 'business')
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- Everyone can read settings; only admins can write
alter table public.app_settings enable row level security;

create policy "Anyone can read app_settings"
  on public.app_settings for select
  using (true);

create policy "Admins can insert app_settings"
  on public.app_settings for insert
  with check (public.is_admin());

create policy "Admins can update app_settings"
  on public.app_settings for update
  using (public.is_admin());

create policy "Admins can delete app_settings"
  on public.app_settings for delete
  using (public.is_admin());

-- Seed default row
insert into public.app_settings (key, value)
values (
  'business',
  '{
    "companyName":    "Bloom",
    "supportEmail":   "support@joinbloom.online",
    "supportPhone":   "",
    "companyAddress":  "",
    "senderName":     "Bloom",
    "replyToEmail":   "support@joinbloom.online",
    "chatwayWidgetId": ""
  }'::jsonb
)
on conflict (key) do nothing;
