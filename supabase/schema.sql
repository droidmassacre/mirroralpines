create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender text not null default 'You',
  body text not null,
  image_path text,
  image_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages
  add column if not exists image_path text,
  add column if not exists image_expires_at timestamptz;

create index if not exists messages_image_expiry_idx
  on public.messages (image_expires_at)
  where image_path is not null;

alter table public.messages enable row level security;

insert into storage.buckets (id, name, public)
  select 'attachments', 'attachments', false
  where not exists (select 1 from storage.buckets where id = 'attachments');

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'
      ]
  where id = 'attachments';

create policy if not exists attachments_no_access on storage.objects
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.messages from anon;
revoke all on table public.messages from authenticated;

create index if not exists messages_id_idx on public.messages (id desc);
