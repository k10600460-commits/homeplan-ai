-- Add branding columns to team_profiles (used by both Pro and Team plans)
ALTER TABLE public.team_profiles
  ADD COLUMN IF NOT EXISTS logo_url      text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#2563EB';

-- Supabase Storage bucket for branding logos (private, 512 KB per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  false,
  524288,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only access their own folder ({user_id}/logo.*)
CREATE POLICY "Users manage own branding files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'branding'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'branding'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
