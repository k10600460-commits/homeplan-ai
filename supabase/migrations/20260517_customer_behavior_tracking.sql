-- ============================================================
-- HomePlanAI — 顧客行動トラッキング マイグレーション
-- 適用方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- 作成日: 2026-05-17
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. plan_generations
--    プラン生成セッションごとの記録
--    (入力条件・生成プラン全体・トークン数を保存)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.plan_generations (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  lot_size        int         not null,              -- sq ft
  budget          int         not null,              -- USD
  family_size     int         not null,
  plans           jsonb       not null default '[]', -- Full plans array from Claude
  input_tokens    int         not null default 0,
  output_tokens   int         not null default 0,
  estimated_cost_usd numeric  not null default 0,
  created_at      timestamptz not null default now()
);

comment on table  public.plan_generations                  is 'Each AI floor plan generation session.';
comment on column public.plan_generations.plans            is 'Snapshot of all 3 generated plans (JSON).';
comment on column public.plan_generations.estimated_cost_usd is 'Claude API cost for this generation.';


-- ─────────────────────────────────────────────────────────────
-- 2. shared_links
--    ビルダーが顧客に送る共有リンク
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shared_links (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  generation_id  uuid        references public.plan_generations(id) on delete set null,
  slug           text        not null unique,          -- Short URL key (e.g. "abc123")
  plans          jsonb       not null default '[]',    -- Snapshot of shared plans
  client_name    text,                                  -- Optional recipient name
  client_email   text,                                  -- Optional recipient email
  expires_at     timestamptz,                           -- NULL = never expires
  is_active      boolean     not null default true,
  view_count     int         not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table  public.shared_links          is 'Shareable plan links sent by builders to clients.';
comment on column public.shared_links.slug     is 'Unique short URL slug (homeplan-ai.vercel.app/s/{slug}).';
comment on column public.shared_links.plans    is 'Plans snapshot at share time (decoupled from generation).';


-- ─────────────────────────────────────────────────────────────
-- 3. link_events
--    顧客がリンクを開いた・PDFをDLした等のイベント
-- ─────────────────────────────────────────────────────────────
create table if not exists public.link_events (
  id           uuid        primary key default gen_random_uuid(),
  link_id      uuid        not null references public.shared_links(id) on delete cascade,
  event_type   text        not null,   -- 'view' | 'pdf_download' | 'plan_selected' | 'return_visit'
  plan_index   smallint,               -- 0-based index of the plan (0/1/2), NULL if not plan-specific
  referrer     text,                   -- HTTP Referer header (anonymized)
  user_agent   text,                   -- Browser UA (for mobile/desktop split)
  ip_hash      text,                   -- SHA-256 of IP (privacy-safe)
  created_at   timestamptz not null default now()
);

comment on table  public.link_events            is 'Client interactions with shared plan links.';
comment on column public.link_events.event_type is 'view=page load, pdf_download=PDF button, plan_selected=expanded plan card, return_visit=returning viewer.';
comment on column public.link_events.ip_hash    is 'Hashed IP address (not stored raw for GDPR compliance).';


-- ─────────────────────────────────────────────────────────────
-- 4. builder_events
--    ビルダー自身のアクション履歴（ファネル分析用）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.builder_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  session_id  text,                    -- Client-side session ID
  event_type  text        not null,
  -- event_type values:
  --   page_view | generate_start | generate_complete | generate_error
  --   pdf_export | share_link_created | upgrade_click | plan_selected
  properties  jsonb       not null default '{}',  -- Arbitrary event properties
  created_at  timestamptz not null default now()
);

comment on table  public.builder_events              is 'Builder activity events for funnel analytics.';
comment on column public.builder_events.properties   is 'Event-specific data (e.g. {lotSize, budget, planId}).';


-- ─────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.plan_generations enable row level security;
alter table public.shared_links     enable row level security;
alter table public.link_events      enable row level security;
alter table public.builder_events   enable row level security;

-- plan_generations: builder reads own
create policy "builder reads own generations"
  on public.plan_generations for select
  using (auth.uid() = user_id);

create policy "builder inserts own generations"
  on public.plan_generations for insert
  with check (auth.uid() = user_id);

-- shared_links: builder manages own; anyone can view active links (for client page)
create policy "builder manages own links"
  on public.shared_links for all
  using (auth.uid() = user_id);

create policy "public reads active shared links"
  on public.shared_links for select
  using (is_active = true);

-- link_events: only the link owner can read; service_role inserts (from server)
create policy "builder reads own link events"
  on public.link_events for select
  using (
    exists (
      select 1 from public.shared_links sl
      where sl.id = link_id and sl.user_id = auth.uid()
    )
  );

-- builder_events: user reads own
create policy "user reads own events"
  on public.builder_events for select
  using (auth.uid() = user_id);

create policy "user inserts own events"
  on public.builder_events for insert
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 6. Indexes
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_plan_generations_user_created
  on public.plan_generations (user_id, created_at desc);

create index if not exists idx_shared_links_user_id
  on public.shared_links (user_id);

create index if not exists idx_shared_links_slug
  on public.shared_links (slug);                          -- Already unique, adds fast lookup

create index if not exists idx_shared_links_expires
  on public.shared_links (expires_at)
  where expires_at is not null;

create index if not exists idx_link_events_link_id_created
  on public.link_events (link_id, created_at desc);

create index if not exists idx_link_events_type
  on public.link_events (event_type);

create index if not exists idx_builder_events_user_created
  on public.builder_events (user_id, created_at desc);

create index if not exists idx_builder_events_type
  on public.builder_events (event_type);


-- ─────────────────────────────────────────────────────────────
-- 7. updated_at auto-trigger for shared_links
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_shared_links_updated_at
  before update on public.shared_links
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 8. Helper: increment_view_count
--    shared_link が閲覧されるたびに view_count を +1
--    (link_events INSERT と同時にサーバーサイドから呼ぶ)
-- ─────────────────────────────────────────────────────────────
create or replace function public.record_link_view(
  p_link_id    uuid,
  p_event_type text,
  p_plan_index smallint  default null,
  p_referrer   text      default null,
  p_user_agent text      default null,
  p_ip_hash    text      default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Insert the event
  insert into public.link_events (link_id, event_type, plan_index, referrer, user_agent, ip_hash)
  values (p_link_id, p_event_type, p_plan_index, p_referrer, p_user_agent, p_ip_hash);

  -- Increment view count on 'view' events only
  if p_event_type = 'view' then
    update public.shared_links
    set view_count = view_count + 1
    where id = p_link_id;
  end if;
end;
$$;

comment on function public.record_link_view is
  'Atomically inserts a link_event and increments view_count on the shared_link.';


-- ─────────────────────────────────────────────────────────────
-- 完了メッセージ
-- ─────────────────────────────────────────────────────────────
do $$
begin
  raise notice '✅ HomePlanAI 顧客行動トラッキング スキーマ適用完了';
  raise notice '   Tables: plan_generations, shared_links, link_events, builder_events';
  raise notice '   Functions: record_link_view, set_updated_at (trigger)';
end $$;
