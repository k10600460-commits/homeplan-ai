-- Phase R (R2): persist portal-open signals into the outreach layer.
-- Written by /api/cron/outreach-sync from link_events (event_type='view' — the
-- server-side per-page-load open event; growth_generated_proposals stats use the
-- same 'view'-only semantics as the live computation in /api/growth/proposals).
-- Additive only: new columns, one widened check constraint, one partial index.

-- 1. growth_contacts — portal open rollup for the lead's contact.
alter table public.growth_contacts
  add column if not exists portal_opened_at      timestamptz,
  add column if not exists portal_last_opened_at timestamptz,
  add column if not exists portal_open_count     integer not null default 0;

comment on column public.growth_contacts.portal_opened_at      is 'First portal open across this contact''s growth-linked shared_links (outreach-sync).';
comment on column public.growth_contacts.portal_last_opened_at is 'Most recent portal open (outreach-sync).';
comment on column public.growth_contacts.portal_open_count     is 'Cumulative portal view events across this contact''s growth-linked shared_links (outreach-sync, absolute recompute).';

-- 2. outreach_log (legacy founder prospect list) — same rollup per company row.
--    outreach_log rows are prospects, NOT events; appending event rows here would
--    corrupt the pending/sent KPI counts read by daily-brief. Open EVENT rows go
--    to growth_outreach_events (type='portal_open', below); outreach_log gets the
--    rollup columns so the legacy list stays in sync.
alter table public.outreach_log
  add column if not exists portal_opened_at      timestamptz,
  add column if not exists portal_last_opened_at timestamptz,
  add column if not exists portal_open_count     integer not null default 0;

comment on column public.outreach_log.portal_opened_at  is 'First portal open across the company''s growth-linked shared_links (outreach-sync; matched via growth_companies.name).';
comment on column public.outreach_log.portal_open_count is 'Cumulative portal view events for the company (outreach-sync, absolute recompute).';

-- 3. growth_outreach_events — allow channel='portal' for the existing
--    type='portal_open'. The original check listed only human outreach channels;
--    widening the allowed set is non-destructive (no rows can become invalid).
alter table public.growth_outreach_events
  drop constraint if exists growth_outreach_events_channel_check;
alter table public.growth_outreach_events
  add constraint growth_outreach_events_channel_check
  check (channel in ('linkedin','email','call','webinar','portal'));

-- 4. DB-level dedup backstop for portal_open appends (outreach-sync also dedups
--    in-app by metadata.link_event_id; this index guards concurrent runs).
create unique index if not exists growth_outreach_events_portal_open_link_event_uidx
  on public.growth_outreach_events ((metadata->>'link_event_id'))
  where type = 'portal_open' and (metadata->>'link_event_id') is not null;
