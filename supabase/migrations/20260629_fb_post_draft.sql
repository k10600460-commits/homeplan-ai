-- Facebook Page post drafts populated by daily-brief or another generator.
create table if not exists public.fb_post_draft (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  message text not null,
  status text not null default 'draft'
    check (status in ('draft', 'posting', 'posted', 'failed')),
  fb_post_id text,
  post_attempts int not null default 0,
  last_error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fb_post_draft_run_status_idx
  on public.fb_post_draft(run_date, status);

alter table public.fb_post_draft enable row level security;

create policy "service_role_all" on public.fb_post_draft
  for all using (auth.role() = 'service_role');

drop trigger if exists fb_post_draft_updated_at on public.fb_post_draft;
create trigger fb_post_draft_updated_at
  before update on public.fb_post_draft
  for each row execute function public.set_updated_at();
