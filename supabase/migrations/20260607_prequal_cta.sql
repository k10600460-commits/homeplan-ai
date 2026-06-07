-- Pre-qualification CTA: builder-configurable preferred-lender URL
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prequal_url   text,
  ADD COLUMN IF NOT EXISTS prequal_label text;

-- Add UPDATE RLS policy for profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Users update own profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users update own profile"
        ON public.profiles
        FOR UPDATE
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id)
    $policy$;
  END IF;
END
$$;
