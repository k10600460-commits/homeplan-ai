-- W4 (error observability): production 5xx / uncaught errors from cron + main APIs.
-- One row per error, written by src/lib/observability.ts (recordError) from a
-- route's catch block. Shares the same wiring as W0 cost recording (no second
-- monitoring stack). The daily brief lists the 24h count + Top-3 routes and warns
-- on the LINE path when the count crosses a threshold.
-- Additive only — no existing table is modified.

create table if not exists public.error_events (
  id          bigint      generated always as identity primary key,
  route       text        not null,
  status      integer     not null,
  message     text        not null,
  stack       text,
  occurred_at timestamptz not null default now()
);

-- Date index: the brief scans "last 24h".
create index if not exists error_events_occurred_at_idx on public.error_events (occurred_at);

comment on table  public.error_events            is 'Runtime 5xx / uncaught errors per route (written by src/lib/observability.ts recordError, read by daily-brief ⚠️ Errors section).';
comment on column public.error_events.route      is 'Stable short route id for Top-N grouping, e.g. "cron/daily-brief".';
comment on column public.error_events.stack      is 'Optional truncated stack trace (nullable).';

alter table public.error_events enable row level security;

-- Server-only table: no anon/authenticated policies (service_role bypasses RLS).
drop policy if exists "service_role_all" on public.error_events;
create policy "service_role_all" on public.error_events
  for all using (auth.role() = 'service_role');
