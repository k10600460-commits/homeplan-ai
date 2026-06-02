CREATE TABLE public.portal_leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id          uuid REFERENCES public.shared_links(id) ON DELETE SET NULL,
  builder_user_id  uuid NOT NULL,
  buyer_name       text,
  buyer_email      text,
  buyer_phone      text,
  plan_index       smallint,
  message          text,
  status           text NOT NULL DEFAULT 'new',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portal_leads_builder_idx ON public.portal_leads (builder_user_id);
CREATE INDEX portal_leads_link_idx    ON public.portal_leads (link_id);

ALTER TABLE public.portal_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_own_leads"
  ON public.portal_leads
  FOR SELECT
  TO authenticated
  USING (auth.uid() = builder_user_id);
