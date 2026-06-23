-- line_proposals: daily research proposals delivered to LINE with approve / reject /
-- hold buttons (see src/app/api/line/{digest,decision} + src/lib/line.ts). Each row
-- carries an unguessable 128-bit decision token; the decision endpoint flips `status`.
--
-- Service-role only: RLS is enabled with NO policies, so anon/authenticated have no
-- access path — the app reaches this table exclusively via the service-role key.
-- (Matches sibling automation tables: daily_brief_log / x_post_draft / reply_draft.
-- The Supabase advisor "RLS enabled, no policy" INFO lint is intentional here.)
create table if not exists public.line_proposals (
  id              uuid primary key default gen_random_uuid(),
  token           text unique not null,              -- 128-bit hex decision token
  run_date        date not null,
  title           text not null,
  url             text,
  why_it_matters  text,
  action_tag      text,
  score           int,
  source          text not null default 'daily-research',
  status          text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'hold')),
  decided_at      timestamptz,
  decided_via     text,                              -- 'line'
  processed_at    timestamptz,                       -- set when handed to 00_AI_INBOX/ (Phase 2)
  created_at      timestamptz not null default now()
);

alter table public.line_proposals enable row level security;
-- No policies on purpose: service-role only.

create index if not exists line_proposals_status_idx
  on public.line_proposals (status, processed_at);
