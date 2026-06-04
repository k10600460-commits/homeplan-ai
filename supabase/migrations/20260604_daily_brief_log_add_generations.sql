-- Add new_generations column to daily_brief_log
-- Tracks plan generation count in last 24h for the Daily Brief KPI block.
-- 2026-06-04

alter table daily_brief_log
  add column if not exists new_generations int not null default 0;
