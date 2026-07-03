-- W2/W1 (2026-07-03, DEC-0703A): reply-watch cron tables.
--   reply_drafts  — §5.5 founding reply drafts for NEW inbound mail, written by
--                   /api/cron/reply-watch every 15 min (instant path). Distinct
--                   from the existing `reply_draft` (singular) table, which is
--                   the once-a-day daily-brief triage store — reply_drafts rows
--                   are also rendered into the Vault by the LOCAL script
--                   obsidian-vault/.claude/scripts/splanai-reply-render.mjs
--                   (server cannot write the Vault; DB is the handoff, same as
--                   content_feedback).
--   bounce_events — mailer-daemon/postmaster DSN detections from the same
--                   inbox scan; feeds the daily bounce-rate send breaker
--                   (alert_state key='send-breaker').
-- Additive only — no existing table is modified. Suppression reuses the
-- EXISTING public.growth_suppression_list (reason='bounce_hard').

-- ────────────────────────────────────────────
-- reply_drafts
-- ────────────────────────────────────────────
create table if not exists public.reply_drafts (
  id               uuid primary key default gen_random_uuid(),
  gmail_message_id text unique,              -- idempotency: one draft per Gmail message
  gmail_thread_id  text,                     -- deep link (mail.google.com/mail/#inbox/<thread>)
  kind             text not null default 'human'
                     check (kind in ('outreach_reply','human')),
  received_at      timestamptz,              -- Gmail internalDate of the inbound mail
  from_email       text not null,
  from_name        text,
  company          text,                     -- resolved via growth_contacts→growth_companies, else outreach_log, else sender domain
  subject          text,
  original_body    text,                     -- inbound body (capped at 8000 chars on insert)
  draft_body       text,                     -- §5.5 HUMANIZE reply draft (Claude); null if generation failed
  status           text not null default 'pending',
                                             -- pending / sent / archived (human updates after copy-paste send)
  created_at       timestamptz not null default now()
);

create index if not exists reply_drafts_status_idx      on public.reply_drafts(status);
create index if not exists reply_drafts_created_at_idx  on public.reply_drafts(created_at desc);
create index if not exists reply_drafts_received_at_idx on public.reply_drafts(received_at desc);

alter table public.reply_drafts enable row level security;

-- Server-only table: no anon/authenticated policies (service_role bypasses RLS).
drop policy if exists "service_role_all" on public.reply_drafts;
create policy "service_role_all" on public.reply_drafts
  for all using (auth.role() = 'service_role');

comment on table  public.reply_drafts is 'Instant §5.5 reply drafts for new inbound mail (written by /api/cron/reply-watch, rendered to the Vault by splanai-reply-render.mjs).';
comment on column public.reply_drafts.gmail_message_id is 'Unique — reply-watch skips messages already drafted, so a failed run can safely re-scan the same window.';

-- ────────────────────────────────────────────
-- bounce_events
-- ────────────────────────────────────────────
create table if not exists public.bounce_events (
  id               uuid primary key default gen_random_uuid(),
  gmail_message_id text unique,              -- idempotency: one event per DSN message
  occurred_at      timestamptz not null default now(),  -- Gmail internalDate of the DSN
  target_email     text,                     -- bounced recipient (null when unextractable — still counts toward the rate)
  reason           text,                     -- matched signal, e.g. 'dsn_sender:mailer-daemon' / 'dsn_subject'
  raw_subject      text,
  created_at       timestamptz not null default now()
);

create index if not exists bounce_events_occurred_at_idx  on public.bounce_events(occurred_at desc);
create index if not exists bounce_events_target_email_idx on public.bounce_events(lower(target_email));

alter table public.bounce_events enable row level security;

-- Server-only table: no anon/authenticated policies (service_role bypasses RLS).
drop policy if exists "service_role_all" on public.bounce_events;
create policy "service_role_all" on public.bounce_events
  for all using (auth.role() = 'service_role');

comment on table  public.bounce_events is 'Inbound DSN (bounce) detections from reply-watch. Daily rate = bounce_events / growth_outreach_events(type=email_sent), JST day — breaker at >3% with sent>=10 (alert_state key=send-breaker).';
