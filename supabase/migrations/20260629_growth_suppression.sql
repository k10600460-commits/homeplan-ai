-- Growth CRM suppression/unsubscribe management for SplanAI's own outbound prospecting.
-- Separate from in-product buyer nurture unsubscribe tables and portal flows.

create table if not exists public.growth_suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  company_id uuid references public.growth_companies(id) on delete set null,
  reason text not null check (reason in ('unsubscribe','bounce_hard','complaint','manual','competitor')),
  created_at timestamptz not null default now()
);

create table if not exists public.growth_unsubscribe_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  lead_id uuid references public.growth_leads(id) on delete set null,
  source text not null check (source in ('email_link','reply','manual')),
  requested_at timestamptz not null default now(),
  honored_at timestamptz
);

create unique index if not exists growth_suppression_list_email_lower_unique
  on public.growth_suppression_list (lower(email))
  where email is not null;

create index if not exists growth_suppression_list_domain_idx
  on public.growth_suppression_list(domain);

create index if not exists growth_unsubscribe_requests_email_lower_idx
  on public.growth_unsubscribe_requests(lower(email));

alter table public.growth_suppression_list enable row level security;
alter table public.growth_unsubscribe_requests enable row level security;

drop policy if exists "master manages growth suppression list" on public.growth_suppression_list;
create policy "master manages growth suppression list"
  on public.growth_suppression_list
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);

drop policy if exists "master manages growth unsubscribe requests" on public.growth_unsubscribe_requests;
create policy "master manages growth unsubscribe requests"
  on public.growth_unsubscribe_requests
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);
