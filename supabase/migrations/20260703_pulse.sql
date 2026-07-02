-- ────────────────────────────────────────────
-- pulse_snapshots / pulse_subscribers — P-A Builder Market Pulse（/pulse）
--
-- pulse_snapshots: 週次 cron /api/cron/pulse-refresh が 1 行/週 upsert。
--   rate   = Freddie Mac PMMS 30yr fixed（FRED MORTGAGE30US）。source='fred' の
--            実測のみ保存（フォールバック定数は公開ページに出さない＝捏造ゼロ）。
--   metros = { "<slug>": { permits: {...}|null, aggregates: {...}|null } }
--            permits    = Census BPS 1-unit（FRED <METRO>BP1FH）最新月 + 直近12ヶ月合計
--            aggregates = SplanAI 匿名集計（現状 null: plan_generations/demo_usage に
--                         メトロ判定材料が無い。n>=10 のみ表示のゲートはアプリ側に実装済み）
--   FAIL-LOUD: 部分失敗でも行は status='partial'/'failed' + error で必ず残す
--   （ページは snapshot 欠損を「updating」表示で吸収。silent-zero 禁止）。
--
-- pulse_subscribers: /pulse の「Weekly builder market digest」フォーム保存先。
--   保存のみ（送信・ダブルオプトインは未実装＝意図的 OFF。人間承認後に別途）。
--   insert は公開 API /api/pulse/subscribe 経由のみ（check_rate_limit RPC で
--   1 IP 3件/日 + email 正規化 + metro allowlist）。生IPは保存しない（SHA-256）。
--
-- RLS: 両テーブルとも service_role のみ（anon/authenticated にポリシーを与えない）。
-- ⚠️ 適用は人間/親エージェントが行う（追加系のみ）。このファイルは作成のみ。
-- ────────────────────────────────────────────

create table if not exists public.pulse_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  snapshot_date date        not null unique,          -- 実行日（UTC）・週1想定
  status        text        not null default 'complete'
    check (status in ('complete', 'partial', 'failed')),
  rate          jsonb,                                -- { pct, asOf, seriesId:'MORTGAGE30US', source:'fred' } | null
  metros        jsonb       not null default '{}',    -- slug → { permits, aggregates }
  error         text,                                 -- partial/failed の理由（fail-loud）
  created_at    timestamptz not null default now()
);

alter table public.pulse_snapshots enable row level security;

create policy "service_role_all" on public.pulse_snapshots
  for all using (auth.role() = 'service_role');

create table if not exists public.pulse_subscribers (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null,                    -- 正規化済み（trim + lowercase）
  metro      text,                                    -- pulse metro slug | null = 全メトロ
  ip_hash    text        not null,                    -- SHA-256(client IP)。生IPは保存しない
  created_at timestamptz not null default now()
);

-- 同一 email × metro の重複購読を DB レベルで防ぐ（API は重複を 200 で吸収）
create unique index if not exists pulse_subscribers_email_metro_key
  on public.pulse_subscribers (email, coalesce(metro, ''));

-- 週次 KPI（購読数 count）用
create index if not exists pulse_subscribers_created_at_idx
  on public.pulse_subscribers (created_at);

alter table public.pulse_subscribers enable row level security;

create policy "service_role_all" on public.pulse_subscribers
  for all using (auth.role() = 'service_role');
