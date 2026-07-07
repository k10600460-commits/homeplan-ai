-- P0 multi-market foundation: snapshot the resolved market on share links.
-- FILE ONLY. Do not apply automatically from Codex.

alter table public.shared_links
  add column if not exists market text not null default 'us'
  check (market in ('us', 'au', 'nz', 'ca'));

comment on column public.shared_links.market is
  'Market snapshot resolved at portal creation time; independent from language.';

create index if not exists idx_shared_links_market
  on public.shared_links (market);
