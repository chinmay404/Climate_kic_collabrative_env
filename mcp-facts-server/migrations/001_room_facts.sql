begin;

create table if not exists public.room_facts (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  fact text not null,
  source text,
  created_by text,
  created_at timestamptz not null default now(),
  check (char_length(fact) > 0)
);

create index if not exists room_facts_room_created_idx
  on public.room_facts (room_id, created_at desc);

commit;
