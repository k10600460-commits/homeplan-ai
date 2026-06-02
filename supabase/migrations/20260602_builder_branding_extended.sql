-- Add contact/branding fields to team_profiles (all nullable, additive only)
ALTER TABLE public.team_profiles
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS website        text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS tagline        text;
