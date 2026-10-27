-- Run in the Supabase SQL editor as the project administrator.
-- Client builds use only the publishable/anon key. Never ship service_role.
begin;
create table if not exists public.englishpilot_sync_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0 and revision < 9007199254740991),
  document jsonb not null,
  updated_at timestamptz not null default now(),
  constraint sync_document_limit check (octet_length(document::text) <= 20971520)
);
alter table public.englishpilot_sync_heads enable row level security;
revoke all on public.englishpilot_sync_heads from public, anon, authenticated;
grant select on public.englishpilot_sync_heads to authenticated;
drop policy if exists englishpilot_read_own_head on public.englishpilot_sync_heads;
create policy englishpilot_read_own_head on public.englishpilot_sync_heads
  for select to authenticated using (user_id = (select auth.uid()));

-- Only this RPC writes checkpoints. It takes no caller-controlled user ID.
create or replace function public.englishpilot_sync_commit(expected_revision bigint, p_document jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  previous bigint;
  next_revision bigint;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0
     or p_document is null or jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'version' is distinct from '1'
     or jsonb_typeof(p_document -> 'state') is distinct from 'object'
     or jsonb_typeof(p_document -> 'recordings') is distinct from 'array'
     or jsonb_typeof(p_document -> 'listeningAudio') is distinct from 'array'
     or octet_length(p_document::text) > 20971520 then
    raise exception 'Invalid sync document' using errcode = '22023';
  end if;
  -- Serialize first inserts as well as updates, within this transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text, 0));
  select revision into previous from public.englishpilot_sync_heads where user_id = caller for update;
  if coalesce(previous, 0) <> expected_revision then return null; end if;
  next_revision := coalesce(previous, 0) + 1;
  insert into public.englishpilot_sync_heads(user_id, revision, document, updated_at)
    values (caller, next_revision, p_document, now())
    on conflict (user_id) do update set revision = excluded.revision, document = excluded.document, updated_at = excluded.updated_at;
  return next_revision;
end;
$$;
revoke all on function public.englishpilot_sync_commit(bigint,jsonb) from public, anon;
grant execute on function public.englishpilot_sync_commit(bigint,jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('englishpilot-sync', 'englishpilot-sync', false, 4194304, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = array['application/octet-stream'];
drop policy if exists englishpilot_read_own_chunks on storage.objects;
drop policy if exists englishpilot_insert_own_chunks on storage.objects;
create policy englishpilot_read_own_chunks on storage.objects for select to authenticated using (
  bucket_id = 'englishpilot-sync' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy englishpilot_insert_own_chunks on storage.objects for insert to authenticated with check (
  bucket_id = 'englishpilot-sync' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'chunks' and storage.filename(name) ~ '^[a-f0-9]{64}$'
  and name ~ '^[a-f0-9-]+/chunks/[a-f0-9]{64}$'
);
-- Deliberately no UPDATE or DELETE policies: history chunks are immutable.
commit;
