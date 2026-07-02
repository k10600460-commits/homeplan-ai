-- ────────────────────────────────────────────
-- content_feedback — ContentOps 複利 feedback ループ（設計:
-- obsidian-vault/SplanAI/60_ContentOps/feedback-loop-design-20260702.md）
--
-- Flow: Vercel cron /api/cron/content-feedback (service_role) が前日の反応
-- (X/FB/blog/portal/builder) を集計して 1 行 upsert → ローカル launchd が
-- anon で read → SplanAI/60_ContentOps/feedback/<ET date>.md に整形。
--
-- FAIL-LOUD: 集計がハード失敗しても行は status='failed' + error で必ず残す
-- （silent-zero 禁止。翌日の /contentops は "failed" を見て、欠損データで
-- 黙って最適化しない）。
--
-- RLS: service_role = 全操作 / anon = public_ready=true の行のみ select。
-- anon 可で安全な理由: この行の内容はそのまま公開 vault の feedback ノートに
-- 載るものだけ（顧客PII・secretは含めない運用）。
--
-- ⚠️ 適用は人間が行う（supabase db push）。このファイルは作成のみ。
-- ────────────────────────────────────────────
create table if not exists public.content_feedback (
  content_date   date primary key,               -- ET (America/New_York) の集計対象日
  status         text not null default 'complete'
    check (status in ('complete', 'failed')),
  schema_version int  not null default 1,
  generated_at   timestamptz not null default now(),
  source_status  jsonb not null default '{}',    -- 各ソースの ok/failed + 理由
  x              jsonb,                          -- 投稿ごとの public_metrics + score
  facebook       jsonb,                          -- 投稿ごとの insights + score
  blog           jsonb,                          -- 当日 published 記事 + serp/clicks
  portal         jsonb,                          -- link_events 集計
  builder        jsonb,                          -- builder_events 集計
  winners        jsonb,                          -- 勝ち角度（channel/angle/score/why）
  losers         jsonb,                          -- 負け角度 or 失敗投稿
  next_angle_ja  text,                           -- 翌日 /contentops への決定的な日本語指示
  error          text,                           -- status='failed' の理由（fail-loud）
  public_ready   boolean not null default false, -- true の行だけ anon read 可
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists content_feedback_status_idx
  on public.content_feedback(status);

alter table public.content_feedback enable row level security;

-- server (Vercel route) は service_role で insert/update
create policy "service_role_all" on public.content_feedback
  for all using (auth.role() = 'service_role');

-- ローカル render (scripts/render-content-feedback.mjs) は anon read のみ
create policy "anon_read_public_ready" on public.content_feedback
  for select to anon
  using (public_ready = true);

drop trigger if exists content_feedback_updated_at on public.content_feedback;
create trigger content_feedback_updated_at
  before update on public.content_feedback
  for each row execute function public.set_updated_at();
