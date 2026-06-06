-- ============================================================
-- SplanAI — 成約トラッキング MVP
-- 2026-06-06
--
-- 1. portal_leads: status 拡張 (CHECK + status_updated_at + UPDATE policy)
-- 2. deals テーブル新設
-- ============================================================


-- ─── 1. portal_leads 拡張 ────────────────────────────────────

ALTER TABLE public.portal_leads
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- 既存行は全て status='new' のため制約追加は安全
ALTER TABLE public.portal_leads
  ADD CONSTRAINT portal_leads_status_check
  CHECK (status IN ('new', 'won', 'lost'));

-- ビルダーが自分のリードの status を更新できる（可逆）
CREATE POLICY "owner_update_own_leads"
  ON public.portal_leads
  FOR UPDATE
  TO authenticated
  USING  (auth.uid() = builder_user_id)
  WITH CHECK (auth.uid() = builder_user_id);


-- ─── 2. deals テーブル ───────────────────────────────────────

CREATE TABLE public.deals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_user_id  uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  lead_id          uuid        REFERENCES public.portal_leads(id)        ON DELETE SET NULL,
  link_id          uuid        REFERENCES public.shared_links(id)        ON DELETE SET NULL,
  status           text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'won', 'lost')),
  contract_value   numeric,
  signed_at        timestamptz,
  property_address text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- 1 lead = 1 deal。lead_id NULL は複数許容（NULL は UNIQUE 制約に非対象）
  CONSTRAINT deals_lead_unique UNIQUE (lead_id)
);

CREATE INDEX deals_builder_idx ON public.deals (builder_user_id);
CREATE INDEX deals_lead_idx    ON public.deals (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX deals_status_idx  ON public.deals (builder_user_id, status);

-- updated_at 自動更新（set_updated_at は 20260517_customer_behavior_tracking で定義済み）
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_own_deals"
  ON public.deals FOR SELECT
  TO authenticated
  USING (auth.uid() = builder_user_id);

CREATE POLICY "owner_insert_own_deals"
  ON public.deals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = builder_user_id);

CREATE POLICY "owner_update_own_deals"
  ON public.deals FOR UPDATE
  TO authenticated
  USING  (auth.uid() = builder_user_id)
  WITH CHECK (auth.uid() = builder_user_id);
