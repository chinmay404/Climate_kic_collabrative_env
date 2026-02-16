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

type ResolvedRoom = {
  id: string;
  matchType: 'id' | 'onyx_session_id';
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function getConfiguredLogLevel(): LogLevel {
  const raw = (process.env.FACTS_LOG_LEVEL || 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

const configuredLogLevel = getConfiguredLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLogLevel];
}

function logEvent(level: LogLevel, event: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(data || {})
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unexpected error.';
}

function previewText(value: string, maxLength = 120): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...(${value.length} chars)`;
}

function summarizeToolArgs(name: string, args: unknown): Record<string, unknown> {
  try {
    if (name === 'store_fact') {
      const parsed = parseStoreFactArgs(args);
      return {
        roomId: parsed.roomId,
        factPreview: previewText(parsed.fact),
        hasSource: Boolean(parsed.source),
        hasCreatedBy: Boolean(parsed.createdBy)
      };
    }

    if (name === 'list_facts') {
      const parsed = parseListFactsArgs(args);
      return {
        roomId: parsed.roomId,
        limit: parsed.limit ?? 50,
        offset: parsed.offset ?? 0
      };
    }

    if (name === 'update_fact') {
      const parsed = parseUpdateFactArgs(args);
      return {
        id: parsed.id,
        hasFact: parsed.fact !== undefined,
        hasSource: parsed.source !== undefined,
        hasCreatedBy: parsed.createdBy !== undefined
      };
    }

    if (name === 'delete_fact') {
      const parsed = parseDeleteFactArgs(args);
      return {
        id: parsed.id
      };
    }
  } catch (error) {
    return {
      parseError: errorMessage(error)
    };
  }

  return {};
}

async function resolveRoomId(inputRoomId: string): Promise<ResolvedRoom> {
  const result = await dbQuery<{ id: string; onyx_session_id: string | null }>(
    `
      select id, onyx_session_id
      from public.rooms
      where id = $1 or onyx_session_id = $1
      limit 1
    `,
    [inputRoomId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `Unknown roomId "${inputRoomId}". It must match an existing public.rooms.id or public.rooms.onyx_session_id.`
    );
  }

  if (row.id === inputRoomId) {
    return {
      id: row.id,
      matchType: 'id'
    };
  }

  return {
    id: row.id,
    matchType: 'onyx_session_id'
  };
}

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
  const resolvedRoom = await resolveRoomId(args.roomId);
  if (resolvedRoom.id !== args.roomId) {
    logEvent('info', 'facts.room.resolved_alias', {
      requestedRoomId: args.roomId,
      resolvedRoomId: resolvedRoom.id,
      matchType: resolvedRoom.matchType
    });
  }

  logEvent('debug', 'facts.insert.start', {
    requestedRoomId: args.roomId,
    resolvedRoomId: resolvedRoom.id,
    factPreview: previewText(args.fact),
    hasSource: Boolean(args.source),
    hasCreatedBy: Boolean(args.createdBy)
  });

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
    [resolvedRoom.id, args.fact, args.source ?? null, args.createdBy ?? null]
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
  logEvent('info', 'facts.insert.success', {
    requestedRoomId: args.roomId,
    roomId: fact.roomId,
    id: fact.id,
    shortId: fact.shortId
  });
  return fact;
}

async function listRoomFacts(args: ListFactsArgs): Promise<RoomFact[]> {
  const resolvedRoom = await resolveRoomId(args.roomId);
  if (resolvedRoom.id !== args.roomId) {
    logEvent('info', 'facts.room.resolved_alias', {
      requestedRoomId: args.roomId,
      resolvedRoomId: resolvedRoom.id,
      matchType: resolvedRoom.matchType
    });
  }

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
    [resolvedRoom.id, limit, offset]
  );

  const facts = result.rows.map((row) => {
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

  logEvent('debug', 'facts.list.success', {
    requestedRoomId: args.roomId,
    roomId: resolvedRoom.id,
    count: facts.length,
    limit,
    offset
  });

  return facts;
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
  if (!row) {
    logEvent('warn', 'facts.update.not_found', { id: args.id });
    return null;
  }

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
  logEvent('info', 'facts.update.success', {
    id: fact.id,
    shortId: fact.shortId
  });
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

  const deleted = (result.rowCount ?? 0) > 0;
  logEvent(deleted ? 'info' : 'warn', 'facts.delete.result', {
    id: args.id,
    deleted
  });
  return deleted;
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
    const { name, arguments: args } = request.params;
    logEvent('info', 'tool.call.received', {
      tool: name,
      args: summarizeToolArgs(name, args)
    });

    try {
      if (name === 'store_fact') {
        const parsed = parseStoreFactArgs(args);
        const fact = await insertRoomFact(parsed);
        logEvent('info', 'tool.call.success', {
          tool: name,
          roomId: fact.roomId,
          id: fact.id,
          shortId: fact.shortId
        });
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
        logEvent('info', 'tool.call.success', {
          tool: name,
          roomId: parsed.roomId,
          count: facts.length
        });
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
          logEvent('warn', 'tool.call.not_found', {
            tool: name,
            id: parsed.id
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, error: 'Fact not found.' })
              }
            ]
          };
        }
        logEvent('info', 'tool.call.success', {
          tool: name,
          id: updated.id,
          shortId: updated.shortId
        });
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
        logEvent(deleted ? 'info' : 'warn', 'tool.call.success', {
          tool: name,
          id: parsed.id,
          deleted
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: deleted })
            }
          ]
        };
      }

      logEvent('warn', 'tool.call.unknown', { tool: name });
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
      const message = errorMessage(error);
      logEvent('error', 'tool.call.failed', {
        tool: name,
        args: summarizeToolArgs(name, args),
        error: message
      });
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
      logEvent('warn', 'http.auth.unauthorized', {
        path: req.path,
        method: req.method
      });
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
  logEvent('info', 'server.ready', { transport: 'stdio' });
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

  logEvent('info', 'http.server.config', {
    host,
    port,
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : ['*'],
    hasApiKey: Boolean(apiKey),
    logLevel: configuredLogLevel
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
    const method = typeof req.body?.method === 'string' ? req.body.method : 'unknown';

    logEvent('debug', 'http.request.post', {
      path: req.path,
      sessionId: sessionId || null,
      rpcMethod: method
    });

    try {
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        logEvent('warn', 'mcp.session.invalid_request', {
          reason: 'missing_or_invalid_session_id',
          rpcMethod: method
        });
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
          logEvent('info', 'mcp.session.closed', { sessionId: sid });
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      const sid = transport.sessionId;
      if (sid) {
        transports[sid] = transport;
        logEvent('info', 'mcp.session.created', { sessionId: sid });
      }
    } catch (error) {
      logEvent('error', 'http.request.post_failed', {
        path: req.path,
        sessionId: sessionId || null,
        rpcMethod: method,
        error: errorMessage(error)
      });
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
      logEvent('warn', 'http.request.get_invalid_session', {
        path: req.path,
        sessionId: sessionId || null
      });
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    logEvent('debug', 'http.request.get', {
      path: req.path,
      sessionId
    });
    await transports[sessionId].handleRequest(req, res);
  };

  const handleDelete = async (req: Request, res: Response) => {
    const sessionId = headerValue(req.headers['mcp-session-id']);
    if (!sessionId || !transports[sessionId]) {
      logEvent('warn', 'http.request.delete_invalid_session', {
        path: req.path,
        sessionId: sessionId || null
      });
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      logEvent('debug', 'http.request.delete', {
        path: req.path,
        sessionId
      });
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      logEvent('error', 'http.request.delete_failed', {
        path: req.path,
        sessionId,
        error: errorMessage(error)
      });
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
      logEvent('error', 'http.server.start_failed', { error: errorMessage(error) });
      process.exit(1);
    }
    logEvent('info', 'server.ready', {
      transport: 'http',
      endpoint: `http://${host}:${port}/mcp`
    });
  });

  process.on('SIGINT', async () => {
    logEvent('info', 'server.shutdown', { signal: 'SIGINT' });
    for (const sessionId of Object.keys(transports)) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        logEvent('error', 'mcp.session.close_failed', {
          sessionId,
          error: errorMessage(error)
        });
      }
    }
    process.exit(0);
  });
}

async function main() {
  const autoMigrate = process.env.FACTS_AUTO_MIGRATE !== 'false';
  const mode = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

  logEvent('info', 'server.start', {
    mode,
    autoMigrate,
    logLevel: configuredLogLevel
  });

  if (autoMigrate) {
    await ensureRoomFactsSchema();
  }

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
  logEvent('error', 'server.start_failed', {
    error: errorMessage(error)
  });
  process.exit(1);
});
