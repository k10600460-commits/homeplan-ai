ALTER TABLE public.outreach_log
  ADD COLUMN IF NOT EXISTS source_no integer,
  ADD COLUMN IF NOT EXISTS fit_tier text,
  ADD COLUMN IF NOT EXISTS priority smallint,
  ADD COLUMN IF NOT EXISTS metro text,
  ADD COLUMN IF NOT EXISTS type_fit text,
  ADD COLUMN IF NOT EXISTS google_rating numeric,
  ADD COLUMN IF NOT EXISTS reviews integer,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS sample_property text,
  ADD COLUMN IF NOT EXISTS cohort text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_due date;
