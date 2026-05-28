-- Daily Brief 自動秘書テーブル群
-- 作成: 2026-05-29

-- ────────────────────────────────────────────
-- D-1: daily_brief_log
--   毎日の brief 実行ログ（重複実行防止 + 履歴）
-- ────────────────────────────────────────────
create table if not exists daily_brief_log (
  id              uuid primary key default gen_random_uuid(),
  run_date        date not null unique,       -- 実行日 (Asia/Tokyo)
  threads_found   int not null default 0,     -- Gmail から取得したスレッド数
  leads_found     int not null default 0,     -- lead / support に分類された件数
  drafts_created  int not null default 0,     -- 返信ドラフト生成件数
  x_posts_created int not null default 0,     -- X 投稿案生成件数
  sent_at         timestamptz,                -- Resend 送信完了時刻
  error           text,                       -- エラー詳細（失敗時）
  created_at      timestamptz not null default now()
);

create index if not exists daily_brief_log_run_date_idx on daily_brief_log(run_date desc);

alter table daily_brief_log enable row level security;

create policy "service_role_all" on daily_brief_log
  for all using (auth.role() = 'service_role');

-- ────────────────────────────────────────────
-- D-2: reply_draft
--   Gmail スレッドごとの AI 返信ドラフト
-- ────────────────────────────────────────────
create table if not exists reply_draft (
  id               uuid primary key default gen_random_uuid(),
  gmail_thread_id  text not null unique,     -- Gmail thread ID（重複防止）
  gmail_message_id text,                     -- 最新メッセージ ID
  from_email       text not null,
  from_name        text,
  subject          text,
  body_snippet     text,                     -- メール本文の先頭 500 文字
  category         text not null default 'noise',
                                             -- lead / support / noise
  summary_ja       text,                     -- 日本語要約（Shoji 向け）
  draft_en         text,                     -- 英語返信ドラフト本文
  status           text not null default 'pending',
                                             -- pending / sent / archived
  received_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists reply_draft_category_idx   on reply_draft(category);
create index if not exists reply_draft_status_idx     on reply_draft(status);
create index if not exists reply_draft_received_idx   on reply_draft(received_at desc);

alter table reply_draft enable row level security;

create policy "service_role_all" on reply_draft
  for all using (auth.role() = 'service_role');

create trigger reply_draft_updated_at
  before update on reply_draft
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────
-- D-3: x_post_draft
--   X (Twitter) 投稿案
-- ────────────────────────────────────────────
create table if not exists x_post_draft (
  id          uuid primary key default gen_random_uuid(),
  run_date    date not null,                -- 生成日
  angle       text,                         -- roi / feature / insight / social_proof / founder
  draft_text  text not null,               -- 投稿本文（280 文字以内想定）
  platform    text not null default 'x',   -- x / linkedin
  status      text not null default 'draft',
                                            -- draft / posted / archived
  posted_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists x_post_draft_run_date_idx on x_post_draft(run_date desc);
create index if not exists x_post_draft_status_idx   on x_post_draft(status);

alter table x_post_draft enable row level security;

create policy "service_role_all" on x_post_draft
  for all using (auth.role() = 'service_role');
