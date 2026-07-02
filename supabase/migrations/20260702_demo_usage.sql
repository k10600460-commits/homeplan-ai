-- ────────────────────────────────────────────
-- demo_usage — signup無し試用（/try）の悪用ガード台帳（Sprint3-W1, A-036）
--
-- 判定: ip_hash(SHA-256) と cookie_id の両方に UNIQUE index。
-- どちらか一致で「試用済み」= 生成は 1回/永続。再訪は保存済み result を再表示。
-- 挿入は「claim → Claude生成 → result 保存」の順（並行リクエストは unique 違反で弾く）。
-- 生成失敗時は claim 行を削除してリトライ可能にする。
--
-- fail-closed: アプリ側 (src/lib/demo-guard.ts) は DB 到達不能時に生成を拒否する。
-- rate-limit-db (fail-open) には依存しない。
--
-- ⚠️ 適用は人間/親エージェントが行う（追加系のみ）。このファイルは作成のみ。
-- ────────────────────────────────────────────
create table if not exists public.demo_usage (
  id            uuid primary key default gen_random_uuid(),
  ip_hash       text not null,            -- SHA-256(client IP)。生IPは保存しない
  cookie_id     text not null,            -- httpOnly cookie の乱数ID
  state         text,                     -- 入力: US州コード（任意・2文字）
  lot_size      integer,                  -- 入力: lot size (sq ft)
  budget        integer,                  -- 入力: budget (USD)
  result        jsonb,                    -- 生成した1コンセプト（再訪時の再表示用）
  model         text,                     -- 使用モデル（コスト監査用）
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

-- 1回/永続 を DB レベルで強制（同時リクエストの二重生成も防ぐ）
create unique index if not exists demo_usage_ip_hash_key   on public.demo_usage (ip_hash);
create unique index if not exists demo_usage_cookie_id_key on public.demo_usage (cookie_id);

-- 24時間グローバルキャップ（Anthropicコスト上限）の COUNT 用
create index if not exists demo_usage_created_at_idx on public.demo_usage (created_at);

alter table public.demo_usage enable row level security;

-- service_role のみ全操作可（anon/authenticated には一切ポリシーを与えない）
create policy "service_role_all" on public.demo_usage
  for all using (auth.role() = 'service_role');
