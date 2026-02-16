import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

function dbLog(event: string, data?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level: 'info',
    event,
    ...(data || {})
  };
  console.log(JSON.stringify(payload));
}

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!value || !value.trim()) {
    throw new Error('DATABASE_URL (or SUPABASE_DATABASE_URL) is required.');
  }
  return value.trim();
}

function shouldUseSsl(databaseUrl: string): boolean {
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.DB_SSL === 'true') return true;
  return databaseUrl.includes('supabase.co') || databaseUrl.includes('supabase.com');
}

function getDbTarget(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    const port = parsed.port || '5432';
    return `${parsed.hostname}:${port}${parsed.pathname}`;
  } catch {
    return 'invalid-db-url';
  }
}

export function getDbPool(): Pool {
  if (!pool) {
    const databaseUrl = getDatabaseUrl();
    const sslEnabled = shouldUseSsl(databaseUrl);
    dbLog('db.pool.init', {
      target: getDbTarget(databaseUrl),
      sslEnabled
    });
    pool = new Pool({
      connectionString: databaseUrl,
      max: 6,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false
    });

    pool.on('error', (error) => {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          event: 'db.pool.error',
          error: error.message
        })
      );
    });
  }
  return pool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return getDbPool().query<T>(text, params);
}

export async function ensureRoomFactsSchema() {
  dbLog('db.schema.ensure.start');
  await dbQuery('create sequence if not exists public.room_fact_short_seq');

  await dbQuery(
    `
      create table if not exists public.room_facts (
        id uuid primary key default gen_random_uuid(),
        room_id text not null references public.rooms(id) on delete cascade,
        short_id text,
        fact text not null,
        source text,
        created_by text,
        created_at timestamptz not null default now(),
        check (char_length(fact) > 0)
      )
    `
  );

  await dbQuery(
    `
      create index if not exists room_facts_room_created_idx
        on public.room_facts (room_id, created_at desc)
    `
  );

  await dbQuery(
    `
      alter table public.room_facts
        add column if not exists short_id text
    `
  );

  await dbQuery(
    `
      alter table public.room_facts
        alter column short_id set default concat(
          'F',
          lpad(nextval('public.room_fact_short_seq')::text, 6, '0')
        )
    `
  );

  await dbQuery(
    `
      update public.room_facts
      set short_id = concat('F', lpad(nextval('public.room_fact_short_seq')::text, 6, '0'))
      where short_id is null
    `
  );

  await dbQuery(
    `
      create unique index if not exists room_facts_short_id_key
        on public.room_facts (short_id)
    `
  );
  dbLog('db.schema.ensure.success');
}
