-- Phase R (R5): minimal cron error monitoring.
-- One row per cron job, written by src/lib/heartbeat.ts:
--   success → last_ok = now(), last_error = null
--   failure → last_error = message (last_ok is preserved so staleness stays visible)
-- The daily brief lists any job with last_ok > 24h old or last_error set.
-- Additive only — no existing table is modified.

create table if not exists public.cron_heartbeats (
  job        text primary key,
  last_ok    timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table  public.cron_heartbeats            is 'Last ok/error per Vercel cron job (written by src/lib/heartbeat.ts, read by daily-brief Cron health section).';
comment on column public.cron_heartbeats.last_ok    is 'Last fully-successful run. NOT cleared on failure, so "stale last_ok" and "recent error" are independent signals.';
comment on column public.cron_heartbeats.last_error is 'Message of the most recent failure; null after the next successful run.';

alter table public.cron_heartbeats enable row level security;

-- Server-only table: no anon/authenticated policies (service_role bypasses RLS).
drop policy if exists "service_role_all" on public.cron_heartbeats;
create policy "service_role_all" on public.cron_heartbeats
  for all using (auth.role() = 'service_role');
