-- Growth CRM prospect proposal tracking.
-- Links one existing in-product shared portal to a growth lead without modifying
-- buyer-facing portal tables or generation flows.

create table if not exists public.growth_generated_proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.growth_companies(id) on delete cascade,
  lead_id uuid references public.growth_leads(id) on delete set null,
  shared_link_id uuid references public.shared_links(id) on delete set null,
  slug text,
  metro text,
  lot_descriptor text,
  status text not null default 'draft' check (status in ('draft','sent','opened','engaged')),
  built_at timestamptz not null default now(),
  first_opened_at timestamptz,
  open_count integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists growth_generated_proposals_lead_id_idx
  on public.growth_generated_proposals(lead_id);

create index if not exists growth_generated_proposals_company_id_idx
  on public.growth_generated_proposals(company_id);

create index if not exists growth_generated_proposals_shared_link_id_idx
  on public.growth_generated_proposals(shared_link_id);

alter table public.growth_generated_proposals enable row level security;

drop policy if exists "master manages growth generated proposals" on public.growth_generated_proposals;
create policy "master manages growth generated proposals"
  on public.growth_generated_proposals
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);
