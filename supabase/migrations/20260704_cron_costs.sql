-- W0 (cost observability): per-call Anthropic spend estimate for the daily cron群.
-- One row per Claude call, written by src/lib/observability.ts (trackedMessage):
--   job/model + input/output tokens from the response usage, est_cost_usd from the
--   in-code pricing table (src/lib/anthropic-pricing.ts). This is a passive RECORD
--   layer — it never bills and never gates a call. The daily brief aggregates it
--   into month-to-date spend + a day-over-day spike alert.
-- Additive only — no existing table is modified.

create table if not exists public.cron_costs (
  id            bigint        generated always as identity primary key,
  job           text          not null,
  model         text          not null,
  input_tokens  integer       not null default 0,
  output_tokens integer       not null default 0,
  est_cost_usd  numeric(12,6) not null default 0,
  created_at    timestamptz   not null default now()
);

-- Date index: the brief scans "this UTC month" and buckets by day.
create index if not exists cron_costs_created_at_idx on public.cron_costs (created_at);

comment on table  public.cron_costs              is 'Estimated Anthropic spend per Claude cron call (written by src/lib/observability.ts, read by daily-brief 💸 API Cost section). Estimate only — never billing.';
comment on column public.cron_costs.job          is 'Logical job id, e.g. "cron/nurture-scan:rate_drop".';
comment on column public.cron_costs.est_cost_usd is 'Estimated USD from anthropic-pricing.ts (input/output tokens × per-MTok rate). Not an invoice figure.';

alter table public.cron_costs enable row level security;

-- Server-only table: no anon/authenticated policies (service_role bypasses RLS).
-- Explicit policy kept for parity with cron_heartbeats / alert_state house style.
drop policy if exists "service_role_all" on public.cron_costs;
create policy "service_role_all" on public.cron_costs
  for all using (auth.role() = 'service_role');
