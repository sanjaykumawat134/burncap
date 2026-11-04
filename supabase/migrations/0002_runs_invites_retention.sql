-- Runs view, member invites, retention purge

-- ─── Runs: most expensive runs in a window (RLS applies: security invoker) ──

create or replace function top_runs(p_ws uuid, p_since timestamptz, p_limit int default 50)
returns table (
  run_id text,
  agents text,
  requests bigint,
  input_tokens bigint,
  output_tokens bigint,
  cost_micros bigint,
  started_at timestamptz,
  ended_at timestamptz
)
language sql stable security invoker as $$
  select
    run_id,
    string_agg(distinct agent_id, ', '),
    count(*),
    sum(input_tokens + cached_input_tokens + cache_write_tokens),
    sum(output_tokens),
    sum(cost_micros),
    min(created_at),
    max(created_at)
  from usage_events
  where workspace_id = p_ws and run_id is not null and created_at >= p_since
  group by run_id
  order by sum(cost_micros) desc
  limit p_limit;
$$;

-- ─── Members with emails (auth.users isn't readable through RLS) ────────────

create or replace function workspace_members_with_email(p_ws uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_ws and is_member(p_ws)
  order by m.created_at;
$$;

-- ─── Invites (only the sha256 of the token is stored) ───────────────────────

create table workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_by uuid references auth.users on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create or replace function is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Members can see invites; only owners can create/change them (enforces owner check + seat limit path)
alter table workspace_invites enable row level security;
create policy "members read invites" on workspace_invites
  for select using (is_member(workspace_id));
create policy "owners insert invites" on workspace_invites
  for insert with check (is_owner(workspace_id));
create policy "owners update invites" on workspace_invites
  for update using (is_owner(workspace_id)) with check (is_owner(workspace_id));
create policy "owners delete invites" on workspace_invites
  for delete using (is_owner(workspace_id));

-- ─── Retention: called by the purge cron once per plan ──────────────────────

create or replace function purge_usage_events(p_plan text, p_days int) returns bigint
language sql as $$
  with deleted as (
    delete from usage_events e
    using workspaces w
    where e.workspace_id = w.id
      and w.plan = p_plan
      and e.created_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*) from deleted;
$$;
revoke execute on function purge_usage_events from public, anon, authenticated;
