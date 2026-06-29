-- Growth CRM daily metrics snapshot.
-- Internal founder sales reporting only; keep separate from in-product buyer tables.

create table if not exists public.growth_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null unique,
  connects_sent int not null default 0,
  dms_sent int not null default 0,
  emails_sent int not null default 0,
  follow_ups_sent int not null default 0,
  connect_accepts int not null default 0,
  replies int not null default 0,
  positive_replies int not null default 0,
  proposals_built int not null default 0,
  demos_booked int not null default 0,
  trials_started int not null default 0,
  paid_new int not null default 0,
  mrr numeric,
  bounce_rate numeric,
  complaint_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_daily_metrics_metric_date_idx
  on public.growth_daily_metrics(metric_date);

drop trigger if exists growth_daily_metrics_updated_at on public.growth_daily_metrics;
create trigger growth_daily_metrics_updated_at
  before update on public.growth_daily_metrics
  for each row execute function public.set_updated_at();

alter table public.growth_daily_metrics enable row level security;

drop policy if exists "master manages growth daily metrics" on public.growth_daily_metrics;
create policy "master manages growth daily metrics"
  on public.growth_daily_metrics
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);
