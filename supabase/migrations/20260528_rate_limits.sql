-- Shared rate limiting via Postgres
-- Replaces per-instance in-memory rate limiter in lib/security.ts

-- Table: one row per (key, window)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_start)
);

-- RLS: service_role bypasses RLS automatically;
-- no policies means all non-service roles are blocked from direct table access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic increment function
-- Returns JSON: { allowed: bool, count: int, limit: int, retry_after: int }
-- SECURITY DEFINER so the function can write rate_limits regardless of the caller's role
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key        text,
  _window_sec integer,
  _limit      integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _count        integer;
  _elapsed      integer;
  _retry_after  integer;
BEGIN
  -- Floor current timestamp to window boundaries
  _window_start := to_timestamp(
    floor(extract(epoch FROM now()) / _window_sec) * _window_sec
  );

  -- Atomic insert-or-increment (no TOCTOU race condition)
  INSERT INTO public.rate_limits (key, window_start, count)
    VALUES (_key, _window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE
    SET count = rate_limits.count + 1
  RETURNING count INTO _count;

  -- Seconds remaining in the current window
  _elapsed     := floor(extract(epoch FROM now()) - extract(epoch FROM _window_start))::integer;
  _retry_after := GREATEST(0, _window_sec - _elapsed);

  -- Probabilistic stale-row cleanup (1% of calls, rows older than 1 day)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
      WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN json_build_object(
    'allowed',     _count <= _limit,
    'count',       _count,
    'limit',       _limit,
    'retry_after', _retry_after
  );
END;
$$;

-- Restrict execution: only service_role may call this function
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
