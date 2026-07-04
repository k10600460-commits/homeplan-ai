-- ────────────────────────────────────────────
-- content_feedback.status: allow 'partial'
--   （設計: obsidian-vault/SplanAI/60_ContentOps/feedback-loop-design-20260702.md
--    + 実装: feat/feedback-link-events-20260704）
--
-- なぜ: 複利の反応回収の主軸は link_events（無料・自社一次データ）。X/FB は
-- 分析読取の env 未投入（課金判断待ち）で当面 unavailable。link_events だけでも
-- feedback/<date>.md を閉じる（render-missing で落とさない）ため、全ソース揃わない
-- 日を 'failed' ではなく 'partial' で残す（fail-loud: unavailable 理由は行に明記、
-- silent-zero はしない）。
--
-- 非破壊: 既存の CHECK を緩めるだけ（値の削除・列変更なし）。既存行の
-- 'complete'/'failed' はそのまま有効。
--
-- ⚠️ 適用は人間（supabase db push / apply_migration）。このファイルは作成のみ。
-- ────────────────────────────────────────────
alter table public.content_feedback
  drop constraint if exists content_feedback_status_check;

alter table public.content_feedback
  add constraint content_feedback_status_check
  check (status in ('complete', 'partial', 'failed'));
