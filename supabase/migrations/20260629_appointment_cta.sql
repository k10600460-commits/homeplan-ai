-- "Book a meeting" CTA: builder-set scheduling URL (Calendly etc.) surfaced as a
-- button on buyer portals. Mirrors the prequal CTA column.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS appointment_url text;
