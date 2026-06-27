-- Extend the existing x_post_draft table used by daily-brief.
alter table public.x_post_draft
  add column if not exists link_url text,
  add column if not exists x_post_id text,
  add column if not exists x_reply_id text,
  add column if not exists post_attempts int not null default 0,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists x_post_draft_platform_run_status_idx
  on public.x_post_draft(platform, run_date, status);

drop trigger if exists x_post_draft_updated_at on public.x_post_draft;
create trigger x_post_draft_updated_at
  before update on public.x_post_draft
  for each row execute function public.set_updated_at();

-- Stores X OAuth2 PKCE token state.
-- Refresh tokens are single-use, so the route updates refresh_token on every refresh.
create table if not exists public.x_oauth_tokens (
  provider text primary key default 'x' check (provider = 'x'),
  access_token text,
  refresh_token text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.x_oauth_tokens enable row level security;

create policy "service_role_all" on public.x_oauth_tokens
  for all using (auth.role() = 'service_role');

drop trigger if exists x_oauth_tokens_updated_at on public.x_oauth_tokens;
create trigger x_oauth_tokens_updated_at
  before update on public.x_oauth_tokens
  for each row execute function public.set_updated_at();

-- Manual one-time seed after completing X OAuth2 PKCE setup:
-- insert into public.x_oauth_tokens(provider, refresh_token)
-- values ('x', '<initial-refresh-token>')
-- on conflict (provider) do update
-- set refresh_token = excluded.refresh_token, updated_at = now();
