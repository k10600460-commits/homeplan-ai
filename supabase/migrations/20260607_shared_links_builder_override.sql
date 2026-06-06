-- Per-portal builder name / logo override for shared_links
-- Allows demo portals (and future admin tooling) to show a specific builder
-- branding without requiring the owning user account to be on a paid plan.
-- When set, these fields take priority over account-level team_profiles branding.
ALTER TABLE shared_links
  ADD COLUMN IF NOT EXISTS builder_name      text,
  ADD COLUMN IF NOT EXISTS builder_logo_url  text;
