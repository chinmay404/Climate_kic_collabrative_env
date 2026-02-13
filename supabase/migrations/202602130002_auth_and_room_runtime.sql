begin;

alter table public.users
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists auth_provider text not null default 'password',
  add column if not exists is_active boolean not null default true;

-- Best-effort backfill for existing local users.
update public.users
set email = case
  when position('@' in username) > 1 then lower(username)
  else lower(username) || '@local.invalid'
end
where email is null;

create unique index if not exists users_email_ci_key
  on public.users ((lower(email)))
  where email is not null;

alter table public.rooms
  add column if not exists ai_thinking boolean not null default false;

alter table public.rooms
  add column if not exists current_persona text not null default 'Narrator';

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  ip_address inet,
  user_agent text
);

create index if not exists user_sessions_user_idx
  on public.user_sessions (user_id, expires_at desc);

create index if not exists user_sessions_active_idx
  on public.user_sessions (expires_at)
  where revoked_at is null;

commit;
