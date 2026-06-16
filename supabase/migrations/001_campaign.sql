create extension if not exists pgcrypto;

create type public.code_status as enum ('available','consumed','cancelled');
create type public.session_status as enum ('active','finished','rejected','expired');
create type public.reward_status as enum ('pending','approved','redeemed','expired','cancelled');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  minimum_daily_score integer not null default 6000,
  maximum_score integer not null default 11070,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  closes_at time not null,
  active boolean not null default true
);

create table public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 24),
  phone_hash text not null,
  phone_last4 char(4) not null,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_ciphertext text not null,
  retention_until date not null
);

create table public.code_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  store_id uuid not null references public.stores(id),
  label text not null,
  quantity integer not null check (quantity > 0),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.code_batches(id),
  code_digest text unique not null,
  status public.code_status not null default 'available',
  consumed_by uuid references auth.users(id),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  player_id uuid not null references auth.users(id),
  code_id uuid unique not null references public.access_codes(id),
  store_id uuid not null references public.stores(id),
  rules_version text not null,
  seed text not null,
  status public.session_status not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  score integer check (score between 0 and 11070),
  perfect_hits smallint,
  accuracy numeric(5,2),
  best_combo numeric(3,1),
  event_hash text,
  risk_score integer not null default 0,
  rejection_reason text,
  device_hash text,
  ip_hash text
);

create table public.game_event_submissions (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.game_sessions(id),
  received_at timestamptz not null default now(),
  event_hash text not null,
  events jsonb not null,
  validation_result jsonb not null,
  unique(session_id,event_hash)
);

create table public.daily_scores (
  campaign_id uuid not null references public.campaigns(id),
  score_date date not null,
  player_id uuid not null references auth.users(id),
  best_session_id uuid not null references public.game_sessions(id),
  best_score integer not null,
  perfect_hits smallint not null,
  best_combo numeric(3,1) not null,
  accuracy numeric(5,2) not null,
  achieved_at timestamptz not null,
  primary key(campaign_id,score_date,player_id)
);

create table public.public_leaderboard (
  campaign_id uuid not null references public.campaigns(id),
  period_type text not null check(period_type in ('daily','general')),
  period_key text not null,
  player_id uuid not null references auth.users(id),
  nickname text not null,
  points integer not null,
  position integer not null,
  updated_at timestamptz not null default now(),
  primary key(campaign_id,period_type,period_key,player_id)
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  player_id uuid not null references auth.users(id),
  reward_type text not null check(reward_type in ('daily_sandwich','champion_week')),
  reward_date date,
  description text not null,
  status public.reward_status not null default 'pending',
  claim_digest text unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_store_id uuid references public.stores(id),
  created_at timestamptz not null default now()
);

create table public.staff_roles (
  user_id uuid not null references auth.users(id),
  store_id uuid references public.stores(id),
  role text not null check(role in ('operator','manager','admin')),
  active boolean not null default true,
  primary key(user_id,role,store_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index access_codes_available_idx on public.access_codes(code_digest) where status='available';
create index sessions_player_idx on public.game_sessions(player_id,started_at desc);
create index daily_ranking_idx on public.daily_scores(campaign_id,score_date,best_score desc);
create index rewards_status_idx on public.rewards(status,expires_at);

alter table public.campaigns enable row level security;
alter table public.stores enable row level security;
alter table public.player_profiles enable row level security;
alter table public.player_private enable row level security;
alter table public.code_batches enable row level security;
alter table public.access_codes enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_event_submissions enable row level security;
alter table public.daily_scores enable row level security;
alter table public.public_leaderboard enable row level security;
alter table public.rewards enable row level security;
alter table public.staff_roles enable row level security;
alter table public.audit_log enable row level security;

create policy "public active campaigns" on public.campaigns
for select to anon,authenticated using(active=true);
create policy "public leaderboard" on public.public_leaderboard
for select to anon,authenticated using(true);
create policy "own profile" on public.player_profiles
for select to authenticated using(auth.uid()=user_id);
create policy "own sessions" on public.game_sessions
for select to authenticated using(auth.uid()=player_id);
create policy "own rewards" on public.rewards
for select to authenticated using(auth.uid()=player_id);

revoke all on all tables in schema public from anon,authenticated;
grant select on public.campaigns,public.public_leaderboard to anon,authenticated;
grant select on public.player_profiles,public.game_sessions,public.rewards to authenticated;
