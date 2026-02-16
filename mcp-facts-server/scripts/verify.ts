import { ensureRoomFactsSchema, dbQuery } from '../src/db.js';

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

async function main() {
  const roomId = requireEnv('FACTS_TEST_ROOM_ID');
  const fact = (process.env.FACTS_TEST_FACT || 'Test fact from mcp-facts-server').trim();
  const source = (process.env.FACTS_TEST_SOURCE || 'mcp-facts-server verify').trim();

  await ensureRoomFactsSchema();

  const inserted = await dbQuery<{
    id: string;
    room_id: string;
    short_id: string | null;
    fact: string;
    source: string | null;
    created_by: string | null;
    created_at: Date;
  }>(
    `
      insert into public.room_facts (room_id, fact, source, created_by)
      values ($1, $2, $3, $4)
      returning id, room_id, short_id, fact, source, created_by, created_at
    `,
    [roomId, fact, source, 'verify-script']
  );

  const row = inserted.rows[0];
  const list = await dbQuery<{
    id: string;
    short_id: string | null;
    fact: string;
    created_at: Date;
  }>(
    `
      select id, short_id, fact, created_at
      from public.room_facts
      where room_id = $1
      order by created_at desc
      limit 5
    `,
    [roomId]
  );

  console.log('Inserted fact:', {
    id: row.id,
    shortId: row.short_id,
    roomId: row.room_id,
    fact: row.fact,
    source: row.source,
    createdAt: row.created_at.toISOString()
  });

  console.log('Latest facts:', list.rows.map((item) => ({
    id: item.id,
    shortId: item.short_id,
    fact: item.fact,
    createdAt: item.created_at.toISOString()
  })));
}

main().catch((error) => {
  console.error('Verify failed:', error);
  process.exit(1);
});
