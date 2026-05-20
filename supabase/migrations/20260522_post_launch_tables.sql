-- Post-Launch Operations テーブル群
-- 作成: 2026-05-22 | Section 3.x (master-todo-post-launch.md)

-- ────────────────────────────────────────────
-- 共通: updated_at を自動更新するトリガー関数
-- ────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────
-- C-1: outreach_log (Section 3.1.1)
-- ────────────────────────────────────────────
create table if not exists outreach_log (
  id               uuid primary key default gen_random_uuid(),
  company_name     text not null,
  contact_name     text,
  contact_email    text,
  contact_linkedin text,
  state            text,
  annual_volume    int,
  source           text,           -- google_maps / nahb_directory / linkedin / inbound
  dm_pattern       text,           -- A_followup / B_salesforce / C_mls_revenue / D_visit_rate / E_revival
  status           text not null default 'pending',
                                   -- pending / sent / replied / qualified / demo_done / trial_started / paid / disqualified
  sent_at          timestamptz,
  replied_at       timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists outreach_log_status_idx on outreach_log(status);
create index if not exists outreach_log_state_idx  on outreach_log(state);
create index if not exists outreach_log_sent_at_idx on outreach_log(sent_at);

alter table outreach_log enable row level security;

-- Service Role のみ書き込み可（フロントからは直接アクセス不可）
create policy "service_role_all" on outreach_log
  for all using (auth.role() = 'service_role');

create trigger outreach_log_updated_at
  before update on outreach_log
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────
-- C-2: seo_articles (Section 3.2)
-- ────────────────────────────────────────────
create table if not exists seo_articles (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  target_keyword      text not null,
  status              text not null default 'draft',
                                     -- draft / published / archived
  draft_content       text,
  published_at        timestamptz,
  serp_position       int,           -- 最新の検索順位
  organic_clicks_30d  int default 0, -- 過去 30 日の organic クリック数
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists seo_articles_status_idx  on seo_articles(status);
create index if not exists seo_articles_keyword_idx on seo_articles(target_keyword);

alter table seo_articles enable row level security;

create policy "service_role_all" on seo_articles
  for all using (auth.role() = 'service_role');

create trigger seo_articles_updated_at
  before update on seo_articles
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────
-- C-3: support_tickets (Section 3.3.2)
-- ────────────────────────────────────────────
create table if not exists support_tickets (
  id           uuid primary key default gen_random_uuid(),
  from_email   text not null,
  from_name    text,
  subject      text,
  body         text,
  category     text,       -- A_tech / B_sales / C_cancel / D_partnership / E_spam
  ai_draft     text,       -- AI が生成した返信ドラフト
  status       text not null default 'new',
                           -- new / drafted / replied / escalated / closed
  received_at  timestamptz not null default now(),
  replied_at   timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists support_tickets_status_idx   on support_tickets(status);
create index if not exists support_tickets_category_idx on support_tickets(category);
create index if not exists support_tickets_received_idx on support_tickets(received_at);

alter table support_tickets enable row level security;

create policy "service_role_all" on support_tickets
  for all using (auth.role() = 'service_role');

create trigger support_tickets_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────
-- C-4: finance_snapshots (Section 3.5.1)
-- ────────────────────────────────────────────
create table if not exists finance_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  date                 date not null unique,
  mrr                  numeric(10, 2) not null default 0,
  arr                  numeric(10, 2) not null default 0,
  active_pro           int not null default 0,
  active_team          int not null default 0,
  trialing             int not null default 0,
  churned_today        int not null default 0,
  refunded_today       numeric(10, 2) not null default 0,
  api_cost_anthropic   numeric(10, 4) not null default 0,
  api_cost_resend      numeric(10, 4) not null default 0,
  total_cost_today     numeric(10, 4) not null default 0,
  gross_margin         numeric(5, 4),  -- 0.0〜1.0
  phase                int,            -- 0 / 1 / 2 / 3
  created_at           timestamptz not null default now()
);

create index if not exists finance_snapshots_date_idx on finance_snapshots(date desc);

alter table finance_snapshots enable row level security;

create policy "service_role_all" on finance_snapshots
  for all using (auth.role() = 'service_role');

-- ────────────────────────────────────────────
-- C-5: legal_watch_diffs (Section 3.4.2)
-- ────────────────────────────────────────────
create table if not exists legal_watch_diffs (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  diff_text     text,
  impact_level  text,          -- High / Medium / Low
  ai_assessment text,          -- Claude API の評価コメント
  snapshot_at   timestamptz not null default now(),
  reviewed_at   timestamptz,   -- Shuraemon がレビューした時刻
  updated_at    timestamptz not null default now()
);

create index if not exists legal_watch_diffs_url_idx         on legal_watch_diffs(url);
create index if not exists legal_watch_diffs_impact_idx      on legal_watch_diffs(impact_level);
create index if not exists legal_watch_diffs_snapshot_idx    on legal_watch_diffs(snapshot_at desc);
create index if not exists legal_watch_diffs_reviewed_idx    on legal_watch_diffs(reviewed_at);

alter table legal_watch_diffs enable row level security;

create policy "service_role_all" on legal_watch_diffs
  for all using (auth.role() = 'service_role');

create trigger legal_watch_diffs_updated_at
  before update on legal_watch_diffs
  for each row execute function set_updated_at();
