-- Growth CRM MVP (internal SplanAI prospect pipeline)
-- Keeps founder prospecting separate from in-product buyer tables:
-- do not modify portal_leads/deals/nurture here.

create table if not exists public.growth_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  domain text,
  metro text,
  state text,
  custom_ratio_note text,
  size_band text check (size_band in ('1-49','~100','100+')),
  builder_type text check (builder_type in ('custom','semi-custom','spec','mixed')),
  tier text check (tier in ('A','B','C')),
  source text check (source in ('apollo','manual','referral','inbound','launch-batch')),
  status text not null default 'new' check (status in ('new','researching','active','nurture','won','lost','disqualified')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.growth_companies(id) on delete cascade,
  first_name text,
  last_name text,
  title text,
  role text check (role in ('owner','sales','other')),
  email text,
  email_status text not null default 'unverified' check (email_status in ('unverified','valid','risky','invalid')),
  linkedin_url text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.growth_companies(id) on delete cascade,
  primary_contact_id uuid references public.growth_contacts(id) on delete set null,
  stage text not null default 'to_contact' check (stage in ('to_contact','contacted','replied','demo_scheduled','trial','won','lost')),
  channel text check (channel in ('linkedin','email','referral','inbound')),
  owner text not null default 'shoji' check (owner in ('shoji','va')),
  next_action text,
  next_action_date date,
  reason_lost text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_sales_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.growth_leads(id) on delete cascade,
  company_id uuid references public.growth_companies(id) on delete cascade,
  author text not null default 'shoji' check (author in ('shoji','claude','va')),
  body text not null,
  tags text[],
  created_at timestamptz not null default now()
);

create index if not exists growth_companies_status_idx on public.growth_companies(status);
create index if not exists growth_companies_tier_idx on public.growth_companies(tier);
create index if not exists growth_companies_metro_idx on public.growth_companies(metro);
create index if not exists growth_contacts_company_id_idx on public.growth_contacts(company_id);
create index if not exists growth_leads_company_id_idx on public.growth_leads(company_id);
create index if not exists growth_leads_stage_idx on public.growth_leads(stage);
create index if not exists growth_leads_next_action_date_idx on public.growth_leads(next_action_date);
create index if not exists growth_sales_notes_lead_id_idx on public.growth_sales_notes(lead_id);
create index if not exists growth_sales_notes_company_id_idx on public.growth_sales_notes(company_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists growth_companies_updated_at on public.growth_companies;
create trigger growth_companies_updated_at
  before update on public.growth_companies
  for each row execute function public.set_updated_at();

drop trigger if exists growth_contacts_updated_at on public.growth_contacts;
create trigger growth_contacts_updated_at
  before update on public.growth_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists growth_leads_updated_at on public.growth_leads;
create trigger growth_leads_updated_at
  before update on public.growth_leads
  for each row execute function public.set_updated_at();

alter table public.growth_companies enable row level security;
alter table public.growth_contacts enable row level security;
alter table public.growth_leads enable row level security;
alter table public.growth_sales_notes enable row level security;

drop policy if exists "master manages growth companies" on public.growth_companies;
create policy "master manages growth companies"
  on public.growth_companies
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);

drop policy if exists "master manages growth contacts" on public.growth_contacts;
create policy "master manages growth contacts"
  on public.growth_contacts
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);

drop policy if exists "master manages growth leads" on public.growth_leads;
create policy "master manages growth leads"
  on public.growth_leads
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);

drop policy if exists "master manages growth sales notes" on public.growth_sales_notes;
create policy "master manages growth sales notes"
  on public.growth_sales_notes
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);

-- Backfill from the legacy founder outreach list. Mapping is conservative:
-- source values outside the new enum become 'launch-batch'; fit_tier star labels
-- map to A/B/C; type_fit is only used when it cleanly matches the new builder_type enum.
with source_rows as (
  select distinct on (
    lower(trim(ol.company_name)),
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), '')
  )
    ol.*,
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), '') as mapped_domain
  from public.outreach_log ol
  where nullif(trim(ol.company_name), '') is not null
  order by
    lower(trim(ol.company_name)),
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), ''),
    ol.created_at desc
)
insert into public.growth_companies (
  name,
  website,
  domain,
  metro,
  state,
  builder_type,
  tier,
  source,
  status,
  notes,
  created_at,
  updated_at
)
select
  trim(sr.company_name),
  nullif(trim(sr.website), ''),
  sr.mapped_domain,
  nullif(trim(sr.metro), ''),
  nullif(trim(sr.state), ''),
  case
    when lower(coalesce(sr.type_fit, '')) in ('custom','semi-custom','spec','mixed') then lower(sr.type_fit)
    else null
  end,
  case
    when upper(coalesce(sr.fit_tier, '')) in ('A','B','C') then upper(sr.fit_tier)
    when sr.fit_tier = '★★★' or sr.priority = 1 then 'A'
    when sr.fit_tier = '★★' or sr.priority = 2 then 'B'
    when sr.fit_tier = '★' or sr.priority = 3 then 'C'
    else null
  end,
  case
    when lower(coalesce(sr.source, '')) = 'inbound' then 'inbound'
    else 'launch-batch'
  end,
  case lower(coalesce(sr.status, ''))
    when 'paid' then 'won'
    when 'disqualified' then 'disqualified'
    when 'pending' then 'new'
    when 'sent' then 'active'
    when 'replied' then 'active'
    when 'qualified' then 'active'
    when 'demo_done' then 'active'
    when 'trial_started' then 'active'
    else 'researching'
  end,
  sr.notes,
  coalesce(sr.created_at, now()),
  coalesce(sr.updated_at, now())
from source_rows sr
where not exists (
  select 1
  from public.growth_companies gc
  where lower(gc.name) = lower(trim(sr.company_name))
     or (sr.mapped_domain is not null and lower(gc.domain) = sr.mapped_domain)
);

-- Contact name in outreach_log is free text; only the first token is mapped to first_name.
with source_rows as (
  select distinct on (
    lower(trim(ol.company_name)),
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), ''),
    lower(coalesce(nullif(trim(ol.contact_email), ''), nullif(trim(ol.contact_linkedin), ''), nullif(trim(ol.contact_name), '')))
  )
    ol.*,
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), '') as mapped_domain
  from public.outreach_log ol
  where nullif(trim(ol.company_name), '') is not null
    and (
      nullif(trim(ol.contact_name), '') is not null
      or nullif(trim(ol.contact_email), '') is not null
      or nullif(trim(ol.contact_linkedin), '') is not null
      or nullif(trim(ol.phone), '') is not null
    )
  order by
    lower(trim(ol.company_name)),
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), ''),
    lower(coalesce(nullif(trim(ol.contact_email), ''), nullif(trim(ol.contact_linkedin), ''), nullif(trim(ol.contact_name), ''))),
    ol.created_at desc
),
matched as (
  select
    sr.*,
    gc.id as growth_company_id
  from source_rows sr
  join public.growth_companies gc
    on lower(gc.name) = lower(trim(sr.company_name))
    or (sr.mapped_domain is not null and lower(gc.domain) = sr.mapped_domain)
)
insert into public.growth_contacts (
  company_id,
  first_name,
  last_name,
  email,
  linkedin_url,
  phone,
  is_primary,
  created_at,
  updated_at
)
select
  m.growth_company_id,
  nullif(split_part(trim(coalesce(m.contact_name, '')), ' ', 1), ''),
  case
    when position(' ' in trim(coalesce(m.contact_name, ''))) > 0
      then nullif(substring(trim(m.contact_name) from position(' ' in trim(m.contact_name)) + 1), '')
    else null
  end,
  nullif(trim(m.contact_email), ''),
  nullif(trim(m.contact_linkedin), ''),
  nullif(trim(m.phone), ''),
  true,
  coalesce(m.created_at, now()),
  coalesce(m.updated_at, now())
from matched m
where not exists (
  select 1
  from public.growth_contacts c
  where c.company_id = m.growth_company_id
    and (
      (nullif(trim(m.contact_email), '') is not null and lower(c.email) = lower(trim(m.contact_email)))
      or (nullif(trim(m.contact_linkedin), '') is not null and c.linkedin_url = trim(m.contact_linkedin))
      or (nullif(trim(m.phone), '') is not null and c.phone = trim(m.phone))
      or (
        nullif(trim(m.contact_email), '') is null
        and nullif(trim(m.contact_linkedin), '') is null
        and lower(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))) = lower(trim(coalesce(m.contact_name, '')))
      )
    )
);

-- outreach_log.status does not distinguish every new lifecycle state; demo_done is mapped to demo_scheduled.
with source_rows as (
  select distinct on (
    lower(trim(ol.company_name)),
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), '')
  )
    ol.*,
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), '') as mapped_domain
  from public.outreach_log ol
  where nullif(trim(ol.company_name), '') is not null
  order by
    lower(trim(ol.company_name)),
    nullif(lower(regexp_replace(regexp_replace(regexp_replace(coalesce(ol.website, ''), '^https?://', '', 'i'), '^www\.', '', 'i'), '/.*$', '')), ''),
    ol.created_at desc
),
matched as (
  select
    sr.*,
    gc.id as growth_company_id
  from source_rows sr
  join public.growth_companies gc
    on lower(gc.name) = lower(trim(sr.company_name))
    or (sr.mapped_domain is not null and lower(gc.domain) = sr.mapped_domain)
),
with_contact as (
  select
    m.*,
    (
      select c.id
      from public.growth_contacts c
      where c.company_id = m.growth_company_id
        and (
          (nullif(trim(m.contact_email), '') is not null and lower(c.email) = lower(trim(m.contact_email)))
          or c.is_primary
        )
      order by
        case when nullif(trim(m.contact_email), '') is not null and lower(c.email) = lower(trim(m.contact_email)) then 0 else 1 end,
        c.created_at asc
      limit 1
    ) as growth_contact_id
  from matched m
)
insert into public.growth_leads (
  company_id,
  primary_contact_id,
  stage,
  channel,
  owner,
  next_action,
  next_action_date,
  reason_lost,
  created_at,
  updated_at
)
select
  wc.growth_company_id,
  wc.growth_contact_id,
  case lower(coalesce(wc.status, ''))
    when 'sent' then 'contacted'
    when 'replied' then 'replied'
    when 'qualified' then 'replied'
    when 'demo_done' then 'demo_scheduled'
    when 'trial_started' then 'trial'
    when 'paid' then 'won'
    when 'disqualified' then 'lost'
    else 'to_contact'
  end,
  case
    when lower(coalesce(wc.source, '')) = 'linkedin' then 'linkedin'
    when lower(coalesce(wc.source, '')) = 'inbound' then 'inbound'
    when nullif(trim(wc.contact_email), '') is not null then 'email'
    else null
  end,
  'shoji',
  nullif(trim(wc.next_action), ''),
  wc.next_action_due,
  case when lower(coalesce(wc.status, '')) = 'disqualified' then wc.notes else null end,
  coalesce(wc.created_at, now()),
  coalesce(wc.updated_at, now())
from with_contact wc
where not exists (
  select 1
  from public.growth_leads gl
  where gl.company_id = wc.growth_company_id
);
