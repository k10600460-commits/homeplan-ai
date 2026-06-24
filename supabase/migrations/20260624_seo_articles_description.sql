-- Adds seo_articles.description (meta description used on blog + OG/metadata).
-- The column exists in production (added out-of-band) but was missing from the
-- migration history; this records it so a fresh DB matches prod. Idempotent.
alter table public.seo_articles
  add column if not exists description text;
