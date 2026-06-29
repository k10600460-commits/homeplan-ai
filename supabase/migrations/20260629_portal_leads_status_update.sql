-- Follow-up lite (#9): let builders manage the status of inbound portal leads.
-- Adds note + updated_at, constrains status to the follow-up lifecycle,
-- and grants the owning builder UPDATE on their own leads.

ALTER TABLE public.portal_leads
  ADD COLUMN IF NOT EXISTS note       text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Constrain status to the follow-up lifecycle
ALTER TABLE public.portal_leads
  DROP CONSTRAINT IF EXISTS portal_leads_status_check;
ALTER TABLE public.portal_leads
  ADD CONSTRAINT portal_leads_status_check
  CHECK (status IN ('new', 'contacted', 'won', 'lost'));

-- Owner (builder) can update their own leads (status / note).
DROP POLICY IF EXISTS "owner_update_own_leads" ON public.portal_leads;
CREATE POLICY "owner_update_own_leads"
  ON public.portal_leads
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = builder_user_id)
  WITH CHECK (auth.uid() = builder_user_id);
