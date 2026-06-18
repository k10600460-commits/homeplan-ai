-- analytics_events: server-side funnel event log
-- Non-blocking best-effort inserts only (never blocks user flows).
-- No PII: raw IPs / email addresses are never stored here.
--   user_id = builder's auth.users UUID (nullable for pre-auth paths)
--   stripe_event_id = Stripe event.id for idempotent dedup (UNIQUE, nullable)

CREATE TABLE analytics_events (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name      text        NOT NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at     timestamptz DEFAULT now() NOT NULL,
  source          text        NOT NULL DEFAULT 'server',
  metadata        jsonb       NOT NULL DEFAULT '{}',
  stripe_event_id text        UNIQUE  -- NULL OK: PostgreSQL UNIQUE allows multiple NULLs
);

CREATE INDEX analytics_events_user_id_idx     ON analytics_events(user_id);
CREATE INDEX analytics_events_event_name_idx  ON analytics_events(event_name);
CREATE INDEX analytics_events_occurred_at_idx ON analytics_events(occurred_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Builders read their own events only
CREATE POLICY "builders_read_own_events"
  ON analytics_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- All writes go through service role (route handlers / webhooks).
-- Service role bypasses RLS in Supabase by default — no INSERT policy needed.

COMMENT ON TABLE analytics_events IS
  'Server-side funnel log. Events: signup, trial_started, checkout_started, checkout_success, share_link_created, portal_lead_created, nurture_sent.';
COMMENT ON COLUMN analytics_events.stripe_event_id IS
  'Stripe event.id — used for idempotent dedup on webhook retries. NULL for non-Stripe events.';
