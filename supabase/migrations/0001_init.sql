-- BurnCap initial schema
-- Costs are stored as integer micro-dollars (1 USD = 1,000,000).

-- ─── Workspaces & membership ────────────────────────────────────────────────

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on workspace_members (user_id);

-- ─── Proxy API keys (only the sha256 hash is stored) ────────────────────────

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on api_keys (workspace_id);

-- ─── Agents (auto-created on first request) ─────────────────────────────────

create table agents (
  workspace_id uuid not null references workspaces on delete cascade,
  id text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'paused')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- ─── Usage ──────────────────────────────────────────────────────────────────

create table usage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces on delete cascade,
  agent_id text not null,
  run_id text,
  customer_id text,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_input_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_micros bigint not null,
  priced boolean not null default true,
  status_code int not null,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index on usage_events (workspace_id, created_at desc);
create index on usage_events (workspace_id, run_id) where run_id is not null;

create table usage_daily (
  workspace_id uuid not null references workspaces on delete cascade,
  day date not null,
  agent_id text not null,
  customer_id text not null default '',
  model text not null,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_micros bigint not null default 0,
  primary key (workspace_id, day, agent_id, customer_id, model)
);

-- ─── Budgets & alerts ───────────────────────────────────────────────────────

create table budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  scope text not null check (scope in ('workspace', 'agent', 'customer')),
  scope_id text,
  period text not null check (period in ('daily', 'monthly')),
  limit_micros bigint not null check (limit_micros > 0),
  action text not null default 'alert' check (action in ('alert', 'throttle', 'pause')),
  throttle_rpm int not null default 5,
  alert_thresholds int[] not null default '{50,80,100}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check ((scope = 'workspace') = (scope_id is null))
);
create index on budgets (workspace_id);

create table alert_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  type text not null check (type in ('email', 'slack')),
  target text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table alert_events (
  budget_id uuid not null references budgets on delete cascade,
  period_key text not null,
  threshold int not null,
  spent_micros bigint not null,
  sent_at timestamptz not null default now(),
  primary key (budget_id, period_key, threshold)
);

-- ─── Model prices (micro-USD per 1M tokens) ─────────────────────────────────

create table model_prices (
  provider text not null,
  model text not null,
  input_per_mtok_micros bigint not null,
  output_per_mtok_micros bigint not null,
  cached_input_per_mtok_micros bigint,
  cache_write_per_mtok_micros bigint,
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);

-- ─── Functions ──────────────────────────────────────────────────────────────

create or replace function increment_usage_daily(
  p_ws uuid, p_day date, p_agent text, p_customer text, p_model text,
  p_in bigint, p_out bigint, p_cost bigint
) returns void language sql as $$
  insert into usage_daily (workspace_id, day, agent_id, customer_id, model,
                           requests, input_tokens, output_tokens, cost_micros)
  values (p_ws, p_day, p_agent, coalesce(p_customer, ''), p_model, 1, p_in, p_out, p_cost)
  on conflict (workspace_id, day, agent_id, customer_id, model) do update set
    requests      = usage_daily.requests + 1,
    input_tokens  = usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = usage_daily.output_tokens + excluded.output_tokens,
    cost_micros   = usage_daily.cost_micros + excluded.cost_micros;
$$;
revoke execute on function increment_usage_daily from public, anon, authenticated;

-- Membership check used by RLS (security definer avoids recursive RLS on workspace_members)
create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- Every new user gets a personal workspace
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ws_id uuid;
begin
  insert into workspaces (name)
  values (split_part(new.email, '@', 1) || '''s workspace')
  returning id into ws_id;

  insert into workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  insert into alert_channels (workspace_id, type, target)
  values (ws_id, 'email', new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Row level security ─────────────────────────────────────────────────────
-- The proxy uses the service-role key and bypasses RLS.

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table api_keys enable row level security;
alter table agents enable row level security;
alter table usage_events enable row level security;
alter table usage_daily enable row level security;
alter table budgets enable row level security;
alter table alert_channels enable row level security;
alter table alert_events enable row level security;
alter table model_prices enable row level security;

create policy "members read workspace" on workspaces
  for select using (is_member(id));
create policy "members read membership" on workspace_members
  for select using (is_member(workspace_id));

create policy "members manage api_keys" on api_keys
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy "members manage agents" on agents
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy "members manage budgets" on budgets
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy "members manage alert_channels" on alert_channels
  for all using (is_member(workspace_id)) with check (is_member(workspace_id));

create policy "members read usage_events" on usage_events
  for select using (is_member(workspace_id));
create policy "members read usage_daily" on usage_daily
  for select using (is_member(workspace_id));
create policy "members read alert_events" on alert_events
  for select using (exists (select 1 from budgets b where b.id = budget_id and is_member(b.workspace_id)));

create policy "authenticated read prices" on model_prices
  for select to authenticated using (true);
