import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response, NextFunction } from 'express';
import { dbQuery, ensureRoomFactsSchema } from './db.js';

type StoreFactArgs = {
  roomId: string;
  fact: string;
  source?: string;
  createdBy?: string;
};

type ListFactsArgs = {
  roomId: string;
  limit?: number;
  offset?: number;
};

type UpdateFactArgs = {
  id: string;
  fact?: string;
  source?: string | null;
  createdBy?: string | null;
};

type DeleteFactArgs = {
  id: string;
};

type RoomFact = {
  id: string;
  shortId: string | null;
  roomId: string;
  fact: string;
  source: string | null;
  createdBy: string | null;
  createdAt: string;
  summary: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Arguments must be an object.');
  }
  return value as Record<string, unknown>;
}

function parseStoreFactArgs(args: unknown): StoreFactArgs {
  const payload = asRecord(args);
  const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
  const fact = typeof payload.fact === 'string' ? payload.fact.trim() : '';
  const source = typeof payload.source === 'string' ? payload.source.trim() : undefined;
  const createdBy = typeof payload.createdBy === 'string' ? payload.createdBy.trim() : undefined;

  if (!roomId) {
    throw new Error('roomId is required.');
  }
  if (!fact) {
    throw new Error('fact is required.');
  }

  return {
    roomId,
    fact,
    source: source || undefined,
    createdBy: createdBy || undefined
  };
}

function parseListFactsArgs(args: unknown): ListFactsArgs {
  const payload = asRecord(args);
  const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
  const limitRaw = typeof payload.limit === 'number' ? payload.limit : undefined;
  const offsetRaw = typeof payload.offset === 'number' ? payload.offset : undefined;

  if (!roomId) {
    throw new Error('roomId is required.');
  }

  const limit =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : undefined;
  const offset =
    typeof offsetRaw === 'number' && Number.isFinite(offsetRaw)
      ? Math.max(offsetRaw, 0)
      : undefined;

  return {
    roomId,
    limit,
    offset
  };
}

function parseUpdateFactArgs(args: unknown): UpdateFactArgs {
  const payload = asRecord(args);
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const fact = typeof payload.fact === 'string' ? payload.fact.trim() : undefined;
  const source =
    payload.source === null
      ? null
      : typeof payload.source === 'string'
        ? payload.source.trim()
        : undefined;
  const createdBy =
    payload.createdBy === null
      ? null
      : typeof payload.createdBy === 'string'
        ? payload.createdBy.trim()
        : undefined;

  if (!id) {
    throw new Error('id is required.');
  }

  if (fact !== undefined && !fact) {
    throw new Error('fact cannot be empty.');
  }

  if (source !== null && source !== undefined && !source) {
    throw new Error('source cannot be empty.');
  }

  if (createdBy !== null && createdBy !== undefined && !createdBy) {
    throw new Error('createdBy cannot be empty.');
  }

  if (fact === undefined && source === undefined && createdBy === undefined) {
    throw new Error('At least one field (fact, source, createdBy) is required.');
  }

  return {
    id,
    fact,
    source,
    createdBy
  };
}

function parseDeleteFactArgs(args: unknown): DeleteFactArgs {
  const payload = asRecord(args);
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';

  if (!id) {
    throw new Error('id is required.');
  }

  return { id };
}

async function insertRoomFact(args: StoreFactArgs): Promise<RoomFact> {
  const result = await dbQuery<{
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
    [args.roomId, args.fact, args.source ?? null, args.createdBy ?? null]
  );

  const row = result.rows[0];
  const fact: RoomFact = {
    id: row.id,
    shortId: row.short_id,
    roomId: row.room_id,
    fact: row.fact,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    summary: ''
  };
  fact.summary = formatFactSummary(fact);
  return fact;
}

async function listRoomFacts(args: ListFactsArgs): Promise<RoomFact[]> {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;

  const result = await dbQuery<{
    id: string;
    room_id: string;
    short_id: string | null;
    fact: string;
    source: string | null;
    created_by: string | null;
    created_at: Date;
  }>(
    `
      select id, room_id, short_id, fact, source, created_by, created_at
      from public.room_facts
      where room_id = $1
      order by created_at desc
      limit $2
      offset $3
    `,
    [args.roomId, limit, offset]
  );

  return result.rows.map((row) => {
    const fact: RoomFact = {
      id: row.id,
      shortId: row.short_id,
      roomId: row.room_id,
      fact: row.fact,
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      summary: ''
    };
    fact.summary = formatFactSummary(fact);
    return fact;
  });
}

async function updateRoomFact(args: UpdateFactArgs): Promise<RoomFact | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (args.fact !== undefined) {
    sets.push(`fact = $${index++}`);
    values.push(args.fact);
  }
  if (args.source !== undefined) {
    sets.push(`source = $${index++}`);
    values.push(args.source);
  }
  if (args.createdBy !== undefined) {
    sets.push(`created_by = $${index++}`);
    values.push(args.createdBy);
  }

  values.push(args.id);
  const result = await dbQuery<{
    id: string;
    room_id: string;
    short_id: string | null;
    fact: string;
    source: string | null;
    created_by: string | null;
    created_at: Date;
  }>(
    `
      update public.room_facts
      set ${sets.join(', ')}
      where id::text = $${index} or short_id = $${index}
      returning id, room_id, short_id, fact, source, created_by, created_at
    `,
    values
  );

  const row = result.rows[0];
  if (!row) return null;

  const fact: RoomFact = {
    id: row.id,
    shortId: row.short_id,
    roomId: row.room_id,
    fact: row.fact,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    summary: ''
  };
  fact.summary = formatFactSummary(fact);
  return fact;
}

async function deleteRoomFact(args: DeleteFactArgs): Promise<boolean> {
  const result = await dbQuery<{ id: string }>(
    `
      delete from public.room_facts
      where id::text = $1 or short_id = $1
      returning id
    `,
    [args.id]
  );

  return (result.rowCount ?? 0) > 0;
}

function formatFactSummary(fact: RoomFact): string {
  const idPart = fact.shortId || fact.id;
  const pieces = [fact.fact];
  if (fact.createdBy) pieces.push(`By: ${fact.createdBy}`);
  if (fact.source) pieces.push(`Source: ${fact.source}`);
  return `[${idPart}] ${pieces.join(' — ')}`;
}

function createServer() {
  const server = new Server(
    {
      name: 'mcp-facts-server',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'store_fact',
          description: 'Store a verified fact for a room.',
          inputSchema: {
            type: 'object',
            properties: {
              roomId: { type: 'string' },
              fact: { type: 'string' },
              source: { type: 'string' },
              createdBy: { type: 'string' }
            },
            required: ['roomId', 'fact']
          }
        },
        {
          name: 'list_facts',
          description: 'List verified facts for a room.',
          inputSchema: {
            type: 'object',
            properties: {
              roomId: { type: 'string' },
              limit: { type: 'number' },
              offset: { type: 'number' }
            },
            required: ['roomId']
          }
        },
        {
          name: 'update_fact',
          description: 'Update an existing fact by ID (short ID or UUID).',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              fact: { type: 'string' },
              source: { type: ['string', 'null'] },
              createdBy: { type: ['string', 'null'] }
            },
            required: ['id']
          }
        },
        {
          name: 'delete_fact',
          description: 'Delete a fact by ID (short ID or UUID).',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' }
            },
            required: ['id']
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      if (name === 'store_fact') {
        const parsed = parseStoreFactArgs(args);
        const fact = await insertRoomFact(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, fact })
            }
          ]
        };
      }

      if (name === 'list_facts') {
        const parsed = parseListFactsArgs(args);
        const facts = await listRoomFacts(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, facts })
            }
          ]
        };
      }

      if (name === 'update_fact') {
        const parsed = parseUpdateFactArgs(args);
        const updated = await updateRoomFact(parsed);
        if (!updated) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, error: 'Fact not found.' })
              }
            ]
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, fact: updated })
            }
          ]
        };
      }

      if (name === 'delete_fact') {
        const parsed = parseDeleteFactArgs(args);
        const deleted = await deleteRoomFact(parsed);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: deleted })
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`
          }
        ],
        isError: true
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error.';
      return {
        content: [
          {
            type: 'text',
            text: message
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function apiKeyMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const headerKey = headerValue(req.headers['x-api-key']);
    const authHeader = headerValue(req.headers['authorization']);
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const token = headerKey || bearer;

    if (!token || token !== apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp-facts-server running (stdio transport).');
}

async function startHttpServer() {
  const host = process.env.MCP_HOST || '0.0.0.0';
  const port = Number.parseInt(process.env.MCP_PORT || '3005', 10);
  const apiKey = process.env.MCP_API_KEY?.trim();
  const allowedHosts = (process.env.MCP_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const app = createMcpExpressApp({
    host,
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined
  });

  if (apiKey) {
    app.use(apiKeyMiddleware(apiKey));
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const handlePost = async (req: Request, res: Response) => {
    const sessionId = headerValue(req.headers['mcp-session-id']);

    try {
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null
        });
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID()
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      const sid = transport.sessionId;
      if (sid) {
        transports[sid] = transport;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling MCP POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  };

  const handleGet = async (req: Request, res: Response) => {
    const sessionId = headerValue(req.headers['mcp-session-id']);
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  const handleDelete = async (req: Request, res: Response) => {
    const sessionId = headerValue(req.headers['mcp-session-id']);
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error handling MCP DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  };

  app.post('/mcp', handlePost);
  app.get('/mcp', handleGet);
  app.delete('/mcp', handleDelete);

  app.listen(port, host, (error?: Error) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start HTTP server:', error);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`MCP Streamable HTTP server listening on ${host}:${port}/mcp`);
  });

  process.on('SIGINT', async () => {
    // eslint-disable-next-line no-console
    console.log('Shutting down MCP HTTP server...');
    for (const sessionId of Object.keys(transports)) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to close session ${sessionId}:`, error);
      }
    }
    process.exit(0);
  });
}

async function main() {
  const autoMigrate = process.env.FACTS_AUTO_MIGRATE !== 'false';
  if (autoMigrate) {
    await ensureRoomFactsSchema();
  }

  const mode = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

  if (mode === 'http') {
    await startHttpServer();
    return;
  }

  if (mode === 'both') {
    await startHttpServer();
    await startStdioServer();
    return;
  }

  await startStdioServer();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
