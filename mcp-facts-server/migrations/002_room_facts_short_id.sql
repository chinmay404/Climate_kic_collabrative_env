begin;

create sequence if not exists public.room_fact_short_seq;

alter table public.room_facts
  add column if not exists short_id text;

alter table public.room_facts
  alter column short_id set default concat(
    'F',
    lpad(nextval('public.room_fact_short_seq')::text, 6, '0')
  );

update public.room_facts
set short_id = concat('F', lpad(nextval('public.room_fact_short_seq')::text, 6, '0'))
where short_id is null;

create unique index if not exists room_facts_short_id_key
  on public.room_facts (short_id);

commit;
