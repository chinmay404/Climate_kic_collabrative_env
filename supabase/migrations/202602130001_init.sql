begin;

create extension if not exists pgcrypto;

create type public.room_status as enum ('active', 'archived', 'deleted');
create type public.room_member_role as enum ('admin', 'member');
create type public.chat_message_role as enum ('user', 'assistant', 'system');
create type public.chat_message_source as enum ('local', 'onyx', 'system');
create type public.proposal_status as enum ('active', 'closed', 'cancelled');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists users_username_ci_key on public.users ((lower(username)));

create table if not exists public.rooms (
  id text primary key,
  onyx_session_id text unique,
  title text not null default 'Valle Verde Simulation',
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  status public.room_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (char_length(id) between 4 and 64)
);

create index if not exists rooms_created_by_idx on public.rooms (created_by_user_id);
create index if not exists rooms_updated_at_idx on public.rooms (updated_at desc);

create table if not exists public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.room_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_read_message_at timestamptz,
  is_active boolean not null default true,
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members (user_id, last_seen_at desc);
create index if not exists room_members_role_idx on public.room_members (room_id, role);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  title text not null,
  description text not null default '',
  created_by_user_id uuid references public.users(id) on delete set null,
  status public.proposal_status not null default 'active',
  duration_hours integer not null default 24 check (duration_hours > 0 and duration_hours <= 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ends_at timestamptz not null,
  closed_at timestamptz,
  ai_response_message_id uuid
);

create index if not exists proposals_room_status_idx on public.proposals (room_id, status, created_at desc);
create index if not exists proposals_ends_at_idx on public.proposals (ends_at);

create table if not exists public.proposal_options (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (proposal_id, sort_order)
);

create index if not exists proposal_options_lookup_idx on public.proposal_options (proposal_id, sort_order);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  sender_user_id uuid references public.users(id) on delete set null,
  sender_name_snapshot text,
  message_role public.chat_message_role not null,
  target_role text,
  content text not null,
  source public.chat_message_source not null default 'local',
  proposal_id uuid references public.proposals(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_room_created_idx on public.messages (room_id, created_at);
create index if not exists messages_room_sender_idx on public.messages (room_id, sender_user_id, created_at);
create index if not exists messages_proposal_idx on public.messages (proposal_id);

create table if not exists public.votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  option_id uuid not null references public.proposal_options(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create index if not exists votes_option_idx on public.votes (option_id);
create index if not exists votes_proposal_updated_idx on public.votes (proposal_id, updated_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  room_id text references public.rooms(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_room_created_idx on public.audit_logs (room_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

alter table public.proposals
  add constraint proposals_ai_response_message_fk
  foreign key (ai_response_message_id)
  references public.messages(id)
  on delete set null;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at
before update on public.rooms
for each row execute function public.touch_updated_at();

drop trigger if exists room_members_touch_updated_at on public.room_members;
create trigger room_members_touch_updated_at
before update on public.room_members
for each row execute function public.touch_updated_at();

drop trigger if exists proposals_touch_updated_at on public.proposals;
create trigger proposals_touch_updated_at
before update on public.proposals
for each row execute function public.touch_updated_at();

drop trigger if exists votes_touch_updated_at on public.votes;
create trigger votes_touch_updated_at
before update on public.votes
for each row execute function public.touch_updated_at();

commit;

