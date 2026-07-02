-- Atomic dedup backstop for knowledge-loop proposals (Phase 2 review follow-up).
--
-- /api/line/propose already does a check-then-insert on (source, title), but two
-- concurrent POSTs (e.g. a double launchd trigger) could both pass the check and
-- insert duplicate pending rows. This partial unique index enforces "at most one
-- row per (source, title)" for knowledge-loop rows at the DB level; the endpoint
-- catches 23505 (unique_violation) and treats it as a dedup skip.
--
-- Scoped to source = 'knowledge-loop' on purpose: historical 'daily-research'
-- rows can legitimately repeat a title across days, so they must stay unaffected.
create unique index if not exists line_proposals_kloop_source_title_uniq
  on public.line_proposals (source, title)
  where source = 'knowledge-loop';
