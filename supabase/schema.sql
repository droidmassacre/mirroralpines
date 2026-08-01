create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender text not null default 'You',
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

revoke all on table public.messages from anon;
revoke all on table public.messages from authenticated;

create index if not exists messages_id_idx on public.messages (id desc);
