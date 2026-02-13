import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

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
  return databaseUrl.includes('supabase.co');
}

function createPool(): Pool {
  const databaseUrl = getDatabaseUrl();
  return new Pool({
    connectionString: databaseUrl,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false
  });
}

export function getDbPool(): Pool {
  if (typeof window !== 'undefined') {
    throw new Error('Database pool is only available on the server.');
  }
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getDbPool().query<T>(text, params);
}

export async function withDbClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
