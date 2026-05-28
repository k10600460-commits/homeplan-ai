-- C-5 fix: Revoke EXECUTE from anon and authenticated
-- REVOKE FROM PUBLIC in the initial migration removed the public grant
-- but not the individual role grants that Supabase auto-assigns via
-- ALTER DEFAULT PRIVILEGES. This migration removes those.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)
  FROM anon, authenticated;
