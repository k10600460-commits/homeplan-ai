-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- subscriptions: tracks each user's Stripe subscription state
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  stripe_price_id        text,
  plan                   text not null default 'free',
  -- plan values: free | pro
  status                 text not null default 'inactive',
  -- status values: trialing | active | past_due | canceled | unpaid | incomplete | inactive
  trial_end              timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_user_id_key unique (user_id)
);

-- api_usage: tracks monthly AI generation count per user
create table if not exists public.api_usage (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  month              text not null,             -- format: "2025-06"
  request_count      int     not null default 0,
  token_count        bigint  not null default 0,
  estimated_cost_usd numeric not null default 0,
  updated_at         timestamptz not null default now(),
  constraint api_usage_user_month_key unique (user_id, month)
);

-- Row Level Security
alter table public.subscriptions enable row level security;
alter table public.api_usage     enable row level security;

-- Users can only read their own data
create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Users read own api_usage"
  on public.api_usage for select
  using (auth.uid() = user_id);
