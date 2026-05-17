-- ============================================================
-- HomePlanAI — 完全DBスキーマ
-- 適用方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- 更新日: 2026-05-17
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- SECTION 1: 既存テーブル（subscriptions / api_usage）
-- ══════════════════════════════════════════════════════════════

-- subscriptions: Stripe サブスクリプション状態を管理
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  stripe_price_id        text,
  plan                   text not null default 'free',  -- free | pro
  status                 text not null default 'inactive',
  -- trialing | active | past_due | canceled | unpaid | incomplete | inactive
  trial_end              timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_user_id_key unique (user_id)
);

-- api_usage: 月次AIジェネレーション回数を管理
create table if not exists public.api_usage (
  id                 uuid    primary key default gen_random_uuid(),
  user_id            uuid    not null references auth.users(id) on delete cascade,
  month              text    not null,              -- format: "2026-05"
  request_count      int     not null default 0,
  token_count        bigint  not null default 0,
  estimated_cost_usd numeric not null default 0,
  updated_at         timestamptz not null default now(),
  constraint api_usage_user_month_key unique (user_id, month)
);

-- RLS (既存)
alter table public.subscriptions enable row level security;
alter table public.api_usage     enable row level security;

create policy if not exists "Users read own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);

create policy if not exists "Users read own api_usage"
  on public.api_usage for select using (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════
-- SECTION 2: 顧客行動トラッキング（新規追加）
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- 2-1. plan_generations
--      プラン生成セッションごとの記録
-- ──────────────────────────────────────────────────────────────
create table if not exists public.plan_generations (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  lot_size           int         not null,              -- sq ft
  budget             int         not null,              -- USD
  family_size        int         not null,
  plans              jsonb       not null default '[]', -- Claude が生成した3プランのスナップショット
  input_tokens       int         not null default 0,
  output_tokens      int         not null default 0,
  estimated_cost_usd numeric     not null default 0,    -- Claude API コスト
  created_at         timestamptz not null default now()
);

comment on table  public.plan_generations is 'AI floor plan generation sessions.';
comment on column public.plan_generations.plans is 'Full 3-plan JSON snapshot returned by Claude.';

alter table public.plan_generations enable row level security;

create policy "builder reads own generations"
  on public.plan_generations for select
  using (auth.uid() = user_id);

create policy "builder inserts own generations"
  on public.plan_generations for insert
  with check (auth.uid() = user_id);

create index if not exists idx_plan_generations_user_created
  on public.plan_generations (user_id, created_at desc);


-- ──────────────────────────────────────────────────────────────
-- 2-2. shared_links
--      ビルダーが顧客に送る共有リンク
-- ──────────────────────────────────────────────────────────────
create table if not exists public.shared_links (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  generation_id uuid        references public.plan_generations(id) on delete set null,
  slug          text        not null unique,           -- 短縮URL キー (例: "abc123")
  plans         jsonb       not null default '[]',     -- 共有時点のプランスナップショット
  client_name   text,                                   -- 送付先の名前（任意）
  client_email  text,                                   -- 送付先メール（任意）
  expires_at    timestamptz,                            -- NULL = 無期限
  is_active     boolean     not null default true,
  view_count    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.shared_links is 'Plan share links sent by builders to clients.';
comment on column public.shared_links.slug is 'Unique slug for /s/{slug} URL.';

alter table public.shared_links enable row level security;

-- ビルダーは自分のリンクを管理
create policy "builder manages own links"
  on public.shared_links for all
  using (auth.uid() = user_id);

-- 顧客（未認証）はアクティブなリンクを閲覧可能
create policy "public reads active shared links"
  on public.shared_links for select
  using (is_active = true);

create index if not exists idx_shared_links_user_id  on public.shared_links (user_id);
create index if not exists idx_shared_links_slug     on public.shared_links (slug);
create index if not exists idx_shared_links_expires
  on public.shared_links (expires_at) where expires_at is not null;


-- ──────────────────────────────────────────────────────────────
-- 2-3. link_events
--      顧客のリンク閲覧・PDF DL・プラン選択などのイベント
-- ──────────────────────────────────────────────────────────────
create table if not exists public.link_events (
  id          uuid        primary key default gen_random_uuid(),
  link_id     uuid        not null references public.shared_links(id) on delete cascade,
  event_type  text        not null,
  -- 'view' | 'pdf_download' | 'plan_selected' | 'return_visit'
  plan_index  smallint,               -- 0-2: どのプランか (NULLはプラン非特定)
  referrer    text,                   -- HTTP Referer
  user_agent  text,                   -- ブラウザ UA
  ip_hash     text,                   -- SHA-256(IP) — GDPR対応でIP非保存
  created_at  timestamptz not null default now()
);

comment on table  public.link_events is 'Client interactions with shared plan links.';

alter table public.link_events enable row level security;

-- リンクオーナー（ビルダー）のみ閲覧
create policy "builder reads own link events"
  on public.link_events for select
  using (
    exists (
      select 1 from public.shared_links sl
      where sl.id = link_id and sl.user_id = auth.uid()
    )
  );

create index if not exists idx_link_events_link_created
  on public.link_events (link_id, created_at desc);

create index if not exists idx_link_events_type
  on public.link_events (event_type);


-- ──────────────────────────────────────────────────────────────
-- 2-4. builder_events
--      ビルダーのファネル分析用アクション履歴
-- ──────────────────────────────────────────────────────────────
create table if not exists public.builder_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  session_id  text,                    -- クライアントサイドのセッションID
  event_type  text        not null,
  -- page_view | generate_start | generate_complete | generate_error
  -- pdf_export | share_link_created | upgrade_click | plan_selected
  properties  jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

comment on table  public.builder_events is 'Builder activity events for funnel analytics.';

alter table public.builder_events enable row level security;

create policy "user reads own builder events"
  on public.builder_events for select
  using (auth.uid() = user_id);

create policy "user inserts own builder events"
  on public.builder_events for insert
  with check (auth.uid() = user_id);

create index if not exists idx_builder_events_user_created
  on public.builder_events (user_id, created_at desc);

create index if not exists idx_builder_events_type
  on public.builder_events (event_type);


-- ══════════════════════════════════════════════════════════════
-- SECTION 3: ヘルパー関数
-- ══════════════════════════════════════════════════════════════

-- updated_at 自動更新トリガー関数
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- shared_links の updated_at トリガー
drop trigger if exists trg_shared_links_updated_at on public.shared_links;
create trigger trg_shared_links_updated_at
  before update on public.shared_links
  for each row execute function public.set_updated_at();

-- api_usage インクリメント関数（既存・保持）
create or replace function public.increment_api_usage(
  p_user_id uuid,
  p_month   text,
  p_requests int,
  p_tokens  bigint,
  p_cost    numeric
)
returns void language plpgsql security definer as $$
begin
  insert into public.api_usage (user_id, month, request_count, token_count, estimated_cost_usd)
  values (p_user_id, p_month, p_requests, p_tokens, p_cost)
  on conflict (user_id, month) do update set
    request_count      = api_usage.request_count      + excluded.request_count,
    token_count        = api_usage.token_count        + excluded.token_count,
    estimated_cost_usd = api_usage.estimated_cost_usd + excluded.estimated_cost_usd,
    updated_at         = now();
end;
$$;

-- 共有リンク閲覧の記録（アトミックに link_events INSERT + view_count INCREMENT）
create or replace function public.record_link_view(
  p_link_id    uuid,
  p_event_type text,
  p_plan_index smallint  default null,
  p_referrer   text      default null,
  p_user_agent text      default null,
  p_ip_hash    text      default null
)
returns void language plpgsql security definer as $$
begin
  insert into public.link_events (link_id, event_type, plan_index, referrer, user_agent, ip_hash)
  values (p_link_id, p_event_type, p_plan_index, p_referrer, p_user_agent, p_ip_hash);

  if p_event_type = 'view' then
    update public.shared_links
    set view_count = view_count + 1
    where id = p_link_id;
  end if;
end;
$$;

comment on function public.record_link_view is
  'Atomically inserts a link_event and increments view_count for "view" events.';


-- ══════════════════════════════════════════════════════════════
-- 完了確認
-- ══════════════════════════════════════════════════════════════
do $$
begin
  raise notice '';
  raise notice '✅ HomePlanAI DBスキーマ適用完了';
  raise notice '   既存テーブル : subscriptions, api_usage';
  raise notice '   新規テーブル : plan_generations, shared_links, link_events, builder_events';
  raise notice '   関数         : set_updated_at, increment_api_usage, record_link_view';
end $$;
