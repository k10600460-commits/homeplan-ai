-- ============================================================
-- HomePlanAI — mls_audit_logs マイグレーション
-- 適用方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- 作成日: 2026-05-17
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- mls_audit_logs
-- MLSライセンス紐づけ機能のすべての操作を監査記録
-- Phase: Month 3+ 機能（現時点はテーブルのみ先行作成）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.mls_audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  action      text        not null,
  -- 'lookup'   : MLS IDで物件情報を検索
  -- 'validate' : MLSライセンス番号を検証
  -- 'link'     : ビルダーのMLS IDを登録
  -- 'unlink'   : MLS IDの登録解除
  -- 'error'    : APIエラー発生
  mls_id      text,                          -- 操作対象のMLS ID
  property_id text,                          -- 対象物件ID（lookup時）
  result      text,                          -- 'found' | 'not_found' | 'valid' | 'invalid' | 'error'
  metadata    jsonb       not null default '{}',
  -- 追加データ例: { "source": "rentcast", "lotSize": 8500, "price": 450000 }
  ip_hash     text,                          -- SHA-256(IP) — GDPR対応
  created_at  timestamptz not null default now()
);

comment on table  public.mls_audit_logs              is 'Audit trail for all MLS license/property lookup operations.';
comment on column public.mls_audit_logs.action       is 'lookup | validate | link | unlink | error';
comment on column public.mls_audit_logs.result       is 'found | not_found | valid | invalid | error';
comment on column public.mls_audit_logs.ip_hash      is 'SHA-256 hashed IP — raw IP is never stored (GDPR).';
comment on column public.mls_audit_logs.metadata     is 'Event-specific data from the MLS/RentCast API response.';


-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.mls_audit_logs enable row level security;

-- ビルダーは自分の操作ログのみ参照可能
create policy "user reads own mls audit logs"
  on public.mls_audit_logs for select
  using (auth.uid() = user_id);

-- INSERT はサーバーサイド（service_role）のみ
-- 注意: anon/authenticatedロールにはINSERT権限を与えない
-- サーバーAPI内で supabaseAdmin.from('mls_audit_logs').insert(...) で記録する


-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_mls_audit_logs_user_created
  on public.mls_audit_logs (user_id, created_at desc);

create index if not exists idx_mls_audit_logs_action
  on public.mls_audit_logs (action);

create index if not exists idx_mls_audit_logs_mls_id
  on public.mls_audit_logs (mls_id)
  where mls_id is not null;


-- ─────────────────────────────────────────────────────────────
-- 完了メッセージ
-- ─────────────────────────────────────────────────────────────
do $$
begin
  raise notice '✅ mls_audit_logs テーブル作成完了';
  raise notice '   RLS: user reads own rows / INSERT via service_role only';
  raise notice '   Indexes: user+created_at, action, mls_id';
end $$;
