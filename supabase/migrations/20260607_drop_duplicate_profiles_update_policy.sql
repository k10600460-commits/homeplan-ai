-- Drop duplicate "Users update own profile" RLS policy on profiles.
-- The prequal_cta migration conditionally created it, but a prior policy
-- with the same name already existed, causing a duplicate. Safe to drop
-- because the correct policy is re-created by the prequal_cta migration
-- DO $$ block if it wasn't present at that time.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
