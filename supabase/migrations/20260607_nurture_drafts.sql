-- nurture_drafts: builder-facing AI-generated follow-up drafts (semi-auto, builder approves before send)
create table if not exists public.nurture_drafts (
  id              uuid primary key default gen_random_uuid(),
  builder_user_id uuid not null references auth.users(id),
  link_id         uuid not null references public.shared_links(id) on delete cascade,
  trigger_type    text not null check (trigger_type in ('rate_drop', 'new_concept', 're_engagement')),
  trigger_context jsonb not null default '{}',
  recipient_email text,
  recipient_name  text,
  subject         text,
  body            text,
  status          text not null default 'pending'
    check (status in ('pending', 'approved', 'sent', 'dismissed', 'failed')),
  resend_id       text,
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.nurture_drafts enable row level security;

-- Builders can SELECT and UPDATE their own drafts
create policy "builder selects own nurture drafts"
  on public.nurture_drafts for select
  using (auth.uid() = builder_user_id);

create policy "builder updates own nurture drafts"
  on public.nurture_drafts for update
  using (auth.uid() = builder_user_id)
  with check (auth.uid() = builder_user_id);

-- INSERT and send are service-role only (no anon/authenticated INSERT policy)

-- Add opt-out support to portal_buyer_state
alter table public.portal_buyer_state
  add column if not exists unsubscribed_at timestamptz;
