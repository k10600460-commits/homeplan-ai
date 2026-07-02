-- Phase R (R3): generic cron watermark / notification-suppression state.
-- One row per job key. Used by /api/cron/hot-lead-alert (key='hot-lead-alert':
-- last_checked = link_events watermark, meta.last_alerts = { link_id: iso } for
-- the 1-push-per-link-per-hour cap) and /api/cron/outreach-sync
-- (key='outreach-sync': last_checked = sync watermark).
-- Additive only — no existing table is modified.

create table if not exists public.alert_state (
  key          text primary key,
  last_checked timestamptz,
  meta         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

comment on table  public.alert_state              is 'Per-cron-job watermark + notification suppression state (server-only).';
comment on column public.alert_state.last_checked is 'Upper bound (exclusive start of next scan) of the last processed link_events window.';
comment on column public.alert_state.meta         is 'Job-specific state, e.g. {"last_alerts":{"<link_id>":"<iso>"}} for hot-lead-alert 1h/link suppression.';

alter table public.alert_state enable row level security;

-- Server-only table: no anon/authenticated policies (service_role bypasses RLS).
-- Explicit policy kept for parity with outreach_log house style.
drop policy if exists "service_role_all" on public.alert_state;
create policy "service_role_all" on public.alert_state
  for all using (auth.role() = 'service_role');
