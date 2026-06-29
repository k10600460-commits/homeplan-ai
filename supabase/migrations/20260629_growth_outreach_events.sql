-- Growth CRM outreach event logging (internal SplanAI prospect pipeline)
-- Manual touch tracking only; keep separate from in-product portal leads/deals/nurture.

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text check (channel in ('linkedin','email','referral','inbound')),
  goal text,
  sequence jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_outreach_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.growth_leads(id) on delete cascade,
  contact_id uuid references public.growth_contacts(id) on delete set null,
  campaign_id uuid references public.growth_campaigns(id) on delete set null,
  channel text not null check (channel in ('linkedin','email','call','webinar')),
  type text not null check (type in ('connect_request','connect_accepted','dm','comment','email_sent','email_open','email_reply','portal_open','call','follow_up')),
  direction text check (direction in ('outbound','inbound')),
  template_key text,
  sentiment text check (sentiment in ('pos','neutral','neg')),
  body_excerpt text,
  occurred_at timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists growth_outreach_events_lead_id_idx on public.growth_outreach_events(lead_id);
create index if not exists growth_outreach_events_occurred_at_idx on public.growth_outreach_events(occurred_at);
create index if not exists growth_outreach_events_type_idx on public.growth_outreach_events(type);
create index if not exists growth_outreach_events_campaign_id_idx on public.growth_outreach_events(campaign_id);
create index if not exists growth_campaigns_active_idx on public.growth_campaigns(active);

alter table public.growth_campaigns enable row level security;
alter table public.growth_outreach_events enable row level security;

drop policy if exists "master manages growth campaigns" on public.growth_campaigns;
create policy "master manages growth campaigns"
  on public.growth_campaigns
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);

drop policy if exists "master manages growth outreach events" on public.growth_outreach_events;
create policy "master manages growth outreach events"
  on public.growth_outreach_events
  for all
  to authenticated
  using (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid)
  with check (auth.uid() = '12d6d041-dc0a-4772-8aa7-d71fa2ff43a7'::uuid);
