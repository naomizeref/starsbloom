-- =============================================================================
-- AUTH EMAIL CODES (6-digit signup verification + password reset codes)
-- =============================================================================
-- Purpose: server-side storage for the one-time 6-digit codes emailed via
-- Resend. Replaces the old sessionStorage approach where a correct code could
-- come back "invalid" (other tab/device/redeploy) and where verification left
-- no session for the password update.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New Query → paste the WHOLE
-- file → Run. Idempotent: safe to re-run.
--
-- SECURITY MODEL: RLS is enabled with ZERO policies, so anon/public roles can
-- do nothing here. Only the service_role key (used exclusively by the
-- api/auth-codes serverless function) can read/write these rows.
--
-- Columns:
--   email/purpose → unique pair; one live code per address per flow.
--   code_hash     → sha256(code + ":" + email). The raw code is NEVER stored.
--   attempts      → incremented per wrong entry; capped at 5 by the API.
--   consumed      → flipped on successful verify (single-use).
--   expires_at    → 15 minutes after issue.
-- =============================================================================

create table if not exists public.auth_email_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('signup_verification', 'password_reset')),
  code_hash text not null,
  attempts integer not null default 0,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint auth_email_codes_email_purpose_key unique (email, purpose)
);

create index if not exists auth_email_codes_expires_at_idx
  on public.auth_email_codes (expires_at);

-- Lock down: RLS on + no policies ⇒ only service_role (which bypasses RLS)
-- can touch this table.
alter table public.auth_email_codes enable row level security;

do $$
begin
  -- Drop any legacy permissive policies from earlier experiments, then make
  -- sure none exist (re-running stays safe).
  drop policy if exists "auth_email_codes_select_own" on public.auth_email_codes;
  drop policy if exists "auth_email_codes_insert_own" on public.auth_email_codes;
exception
  when undefined_table then null;
end $$;
