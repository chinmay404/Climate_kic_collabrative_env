# Supabase Persistence Foundation

This project now includes a normalized Postgres schema and server DB client for Supabase-backed persistence.

## 1) Environment

Set one of these in your runtime environment:

- `DATABASE_URL`
- `SUPABASE_DATABASE_URL`

Optional:

- `DB_SSL=true` (recommended for Supabase, default behavior is already SSL-on for `supabase.co`)

Example format:

```bash
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

## 2) Apply migration

Migration files:

- `supabase/migrations/202602130001_init.sql`
- `supabase/migrations/202602130002_auth_and_room_runtime.sql`

Apply with `psql`:

```bash
psql "$DATABASE_URL" -f supabase/migrations/202602130001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/202602130002_auth_and_room_runtime.sql
```

## 3) Schema design (normalized)

Core tables:

- `users`
- `rooms`
- `room_members`
- `messages`
- `proposals`
- `proposal_options`
- `votes`
- `audit_logs`

Enums:

- `room_status`
- `room_member_role`
- `chat_message_role`
- `chat_message_source`
- `proposal_status`

## 4) Server DB access layer

Added files:

- `src/lib/db.ts`
- `src/lib/persistence/types.ts`
- `src/lib/repositories/persistence-repository.ts`

Repository currently covers:

- user upsert / login touch
- room create with admin membership
- member upsert / presence touch
- list rooms for a user
- audit log write / read

## 5) Current status

Completed:

1. `chat` and `vote` API routes now read/write through Postgres repositories.
2. `GET /api/rooms` added for user room history.
3. `GET /api/rooms/[roomId]/logs` added for room-level audit visibility.
4. Password auth + 1-hour cookie/session persistence added (`/api/auth`, `user_sessions`).

Still pending:

1. One-time importer from `chat_db.json` into normalized tables (optional migration helper).
