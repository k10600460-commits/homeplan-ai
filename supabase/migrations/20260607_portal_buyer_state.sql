-- portal_buyer_state: per-link buyer favorites, saved configurator settings, and visit tracking
create table if not exists public.portal_buyer_state (
  id                   uuid primary key default gen_random_uuid(),
  link_id              uuid not null unique references public.shared_links(id) on delete cascade,
  favorites            text[]   not null default '{}',
  saved_configs        jsonb    not null default '{}',
  buyer_email          text,
  visit_count          int      not null default 0,
  last_visited_at      timestamptz,
  previous_visited_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.portal_buyer_state enable row level security;

-- Builders can SELECT their own buyers' state (via shared_links.user_id)
create policy "builder reads own buyer state"
  on public.portal_buyer_state
  for select
  using (
    exists (
      select 1 from public.shared_links sl
      where sl.id = portal_buyer_state.link_id
        and sl.user_id = auth.uid()
    )
  );

-- Write access is service-role only (no anon INSERT/UPDATE policy)

-- Track when the plans array was last modified (for "Updated since last visit" banner)
alter table public.shared_links
  add column if not exists plans_updated_at timestamptz;
