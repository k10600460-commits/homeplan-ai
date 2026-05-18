-- ============================================================
-- HomePlanAI — External API Usage Tracking
-- Created: 2026-05-18
-- ============================================================

-- External API usage tracker (Google Maps, RentCast, etc.)
CREATE TABLE IF NOT EXISTS public.api_usage_external (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service       text        NOT NULL,        -- 'google_maps' | 'rentcast'
  month         text        NOT NULL,        -- 'YYYY-MM'
  request_count int         NOT NULL DEFAULT 0,
  warning_sent  boolean     NOT NULL DEFAULT false,
  stopped       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service, month)
);

ALTER TABLE public.api_usage_external ENABLE ROW LEVEL SECURITY;

-- Service-role only (no public access)
CREATE POLICY "service_role_only" ON public.api_usage_external
  USING (false);

-- Atomic increment + return new count
CREATE OR REPLACE FUNCTION public.increment_external_usage(
  p_service text,
  p_month   text
) RETURNS TABLE(request_count int, warning_sent boolean, stopped boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.api_usage_external (service, month, request_count)
  VALUES (p_service, p_month, 1)
  ON CONFLICT (service, month) DO UPDATE
    SET request_count = api_usage_external.request_count + 1,
        updated_at    = now();

  RETURN QUERY
    SELECT a.request_count, a.warning_sent, a.stopped
    FROM public.api_usage_external a
    WHERE a.service = p_service AND a.month = p_month;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_external_usage_flag(
  p_service      text,
  p_month        text,
  p_warning_sent boolean DEFAULT NULL,
  p_stopped      boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.api_usage_external (service, month, request_count,
    warning_sent, stopped)
  VALUES (p_service, p_month, 0,
    COALESCE(p_warning_sent, false),
    COALESCE(p_stopped, false))
  ON CONFLICT (service, month) DO UPDATE
    SET warning_sent = COALESCE(p_warning_sent, api_usage_external.warning_sent),
        stopped      = COALESCE(p_stopped,      api_usage_external.stopped),
        updated_at   = now();
END;
$$;

-- Monthly reset (called by cron)
CREATE OR REPLACE FUNCTION public.reset_external_usage_for_month(
  p_month text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.api_usage_external
  SET request_count = 0,
      warning_sent  = false,
      stopped       = false,
      updated_at    = now()
  WHERE month = p_month;
END;
$$;
