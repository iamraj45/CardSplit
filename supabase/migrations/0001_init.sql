-- CardSplit: accounts, synced reconciliations, sharing.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Security model
--   * Row Level Security is on for every table. Clients may only READ rows they have access to.
--   * Every WRITE to reconciliations/members/invites goes through the SECURITY DEFINER functions
--     below, which check the caller's role and the document version atomically.
--   * The anon key is safe in the browser; nothing here trusts client-supplied user ids.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  person_id text not null check (char_length(person_id) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

create table public.reconciliations (
  id text primary key check (char_length(id) between 1 and 64),
  owner_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
create index reconciliations_updated_at_idx on public.reconciliations (updated_at);

create table public.reconciliation_members (
  reconciliation_id text not null references public.reconciliations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (reconciliation_id, user_id)
);
create index reconciliation_members_user_idx on public.reconciliation_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id text not null references public.reconciliations (id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (reconciliation_id, email)
);

create table public.saved_people (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null check (char_length(name) between 1 and 80),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

-- Role of the signed-in user for a reconciliation (definer: avoids RLS recursion on members).
create function public.my_role(p_id text) returns text
language sql stable security definer set search_path = public as $$
  select role from reconciliation_members where reconciliation_id = p_id and user_id = auth.uid()
$$;

alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (id = auth.uid());
create policy "profiles: insert own" on public.profiles for insert
  with check (id = auth.uid() and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and lower(email) = lower(auth.jwt() ->> 'email'));

alter table public.reconciliations enable row level security;
create policy "reconciliations: members read" on public.reconciliations for select using (public.my_role(id) is not null);

alter table public.reconciliation_members enable row level security;
create policy "members: co-members read" on public.reconciliation_members for select
  using (public.my_role(reconciliation_id) is not null);

alter table public.invites enable row level security;
create policy "invites: owner reads" on public.invites for select using (public.my_role(reconciliation_id) = 'owner');

alter table public.saved_people enable row level security;
create policy "saved_people: own rows" on public.saved_people for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Functions (the only write path for shared data)
-- ---------------------------------------------------------------------------------------------

-- Create or update a reconciliation with an optimistic version check.
-- p_expected_version = 0 means "new". Returns {status: ok|conflict|forbidden|deleted|missing, ...}.
create function public.save_reconciliation(p_id text, p_data jsonb, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rec reconciliations%rowtype;
  caller_role text;
  new_version integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if pg_column_size(p_data) > 5000000 then raise exception 'reconciliation too large'; end if;

  select * into rec from reconciliations where id = p_id for update;
  if not found then
    if p_expected_version <> 0 then
      return jsonb_build_object('status', 'missing');
    end if;
    insert into reconciliations (id, owner_id, data, version, updated_by) values (p_id, uid, p_data, 1, uid);
    insert into reconciliation_members (reconciliation_id, user_id, role) values (p_id, uid, 'owner');
    return jsonb_build_object('status', 'ok', 'version', 1);
  end if;

  select role into caller_role from reconciliation_members where reconciliation_id = p_id and user_id = uid;
  if caller_role is null or caller_role = 'viewer' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if rec.deleted_at is not null then
    return jsonb_build_object('status', 'deleted');
  end if;
  if rec.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict', 'version', rec.version, 'data', rec.data);
  end if;

  update reconciliations
     set data = p_data, version = version + 1, updated_at = now(), updated_by = uid
   where id = p_id
   returning version into new_version;
  return jsonb_build_object('status', 'ok', 'version', new_version);
end $$;

-- Owner: delete for everyone (soft delete so other devices learn about it). Others: leave.
create function public.delete_reconciliation(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller_role text := public.my_role(p_id);
begin
  if caller_role is null then return jsonb_build_object('status', 'forbidden'); end if;
  if caller_role = 'owner' then
    update reconciliations
       set deleted_at = now(), data = '{}'::jsonb, version = version + 1, updated_at = now(), updated_by = auth.uid()
     where id = p_id and deleted_at is null;
    delete from invites where reconciliation_id = p_id;
    return jsonb_build_object('status', 'deleted');
  end if;
  delete from reconciliation_members where reconciliation_id = p_id and user_id = auth.uid();
  return jsonb_build_object('status', 'left');
end $$;

-- Everything the caller can see that changed (or was shared with them) after p_since.
-- p_since null = everything. Includes soft-deleted rows so devices can remove them.
create function public.pull_reconciliations(p_since timestamptz)
returns table (
  id text, data jsonb, version integer, updated_at timestamptz, deleted_at timestamptz,
  role text, owner_id uuid, owner_name text, member_count integer
)
language sql stable security definer set search_path = public as $$
  select r.id, r.data, r.version, r.updated_at, r.deleted_at,
         m.role, r.owner_id, p.display_name,
         (select count(*)::integer from reconciliation_members x where x.reconciliation_id = r.id)
    from reconciliations r
    join reconciliation_members m on m.reconciliation_id = r.id and m.user_id = auth.uid()
    left join profiles p on p.id = r.owner_id
   where p_since is null or r.updated_at > p_since or m.created_at > p_since
$$;

-- Ids the caller can currently access (to drop local copies after being removed from a share).
create function public.my_reconciliation_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select reconciliation_id from reconciliation_members where user_id = auth.uid()
$$;

-- Members and pending invites of a reconciliation (any member may look).
create function public.list_members(p_id text)
returns table (user_id uuid, email text, display_name text, role text, pending boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.email, p.display_name, m.role, false
    from reconciliation_members m left join profiles p on p.id = m.user_id
   where m.reconciliation_id = p_id and public.my_role(p_id) is not null
  union all
  select null, i.email, null, i.role, true
    from invites i
   where i.reconciliation_id = p_id and i.accepted_at is null and public.my_role(p_id) = 'owner'
$$;

-- Owner invites by email: adds an existing user straight away, otherwise leaves a pending invite.
create function public.invite_member(p_id text, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  email_norm text := lower(trim(p_email));
begin
  if public.my_role(p_id) is distinct from 'owner' then return jsonb_build_object('status', 'forbidden'); end if;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  if email_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;

  select id into target from profiles where lower(email) = email_norm;
  if target is not null then
    if exists (select 1 from reconciliation_members where reconciliation_id = p_id and user_id = target) then
      return jsonb_build_object('status', 'already');
    end if;
    insert into reconciliation_members (reconciliation_id, user_id, role) values (p_id, target, p_role);
    return jsonb_build_object('status', 'added');
  end if;

  insert into invites (reconciliation_id, email, role, invited_by)
  values (p_id, email_norm, p_role, auth.uid())
  on conflict (reconciliation_id, email) do update set role = excluded.role, accepted_at = null;
  return jsonb_build_object('status', 'invited');
end $$;

create function public.set_member_role(p_id text, p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(p_id) is distinct from 'owner' then return jsonb_build_object('status', 'forbidden'); end if;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  update reconciliation_members set role = p_role
   where reconciliation_id = p_id and user_id = p_user and role <> 'owner';
  return jsonb_build_object('status', 'ok');
end $$;

create function public.remove_member(p_id text, p_user uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(p_id) is distinct from 'owner' then return jsonb_build_object('status', 'forbidden'); end if;
  if p_user is not null then
    delete from reconciliation_members where reconciliation_id = p_id and user_id = p_user and role <> 'owner';
  end if;
  if p_email is not null then
    delete from invites where reconciliation_id = p_id and email = lower(trim(p_email));
  end if;
  return jsonb_build_object('status', 'ok');
end $$;

-- Called after sign-in: turn invites addressed to the caller's email into memberships.
create function public.accept_pending_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare
  accepted integer := 0;
  inv record;
begin
  if auth.uid() is null then return 0; end if;
  for inv in
    select * from invites
     where lower(email) = lower(auth.jwt() ->> 'email') and accepted_at is null
  loop
    insert into reconciliation_members (reconciliation_id, user_id, role)
    values (inv.reconciliation_id, auth.uid(), inv.role)
    on conflict do nothing;
    update invites set accepted_at = now() where id = inv.id;
    accepted := accepted + 1;
  end loop;
  return accepted;
end $$;

-- Only signed-in users may call the functions.
revoke all on function public.my_role(text) from public, anon;
revoke all on function public.save_reconciliation(text, jsonb, integer) from public, anon;
revoke all on function public.delete_reconciliation(text) from public, anon;
revoke all on function public.pull_reconciliations(timestamptz) from public, anon;
revoke all on function public.my_reconciliation_ids() from public, anon;
revoke all on function public.list_members(text) from public, anon;
revoke all on function public.invite_member(text, text, text) from public, anon;
revoke all on function public.set_member_role(text, uuid, text) from public, anon;
revoke all on function public.remove_member(text, uuid, text) from public, anon;
revoke all on function public.accept_pending_invites() from public, anon;

grant execute on function public.my_role(text) to authenticated;
grant execute on function public.save_reconciliation(text, jsonb, integer) to authenticated;
grant execute on function public.delete_reconciliation(text) to authenticated;
grant execute on function public.pull_reconciliations(timestamptz) to authenticated;
grant execute on function public.my_reconciliation_ids() to authenticated;
grant execute on function public.list_members(text) to authenticated;
grant execute on function public.invite_member(text, text, text) to authenticated;
grant execute on function public.set_member_role(text, uuid, text) to authenticated;
grant execute on function public.remove_member(text, uuid, text) to authenticated;
grant execute on function public.accept_pending_invites() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: notify members when a shared reconciliation or its membership changes.
-- ---------------------------------------------------------------------------------------------
alter publication supabase_realtime add table public.reconciliations, public.reconciliation_members;
