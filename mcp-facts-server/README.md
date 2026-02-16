# MCP Facts Server

Standalone MCP server that stores and lists verified facts per room in the shared Postgres/Supabase database. It uses the MCP stdio transport so an agent can call tools directly.

## Requirements

- Node.js 18+
- A Postgres database that already contains the `public.rooms` table
- Environment variable: `DATABASE_URL` (or `SUPABASE_DATABASE_URL`)

## Setup

```bash
cd mcp-facts-server
npm install
```

## Migrate (create `room_facts` table)

```bash
npm run migrate
```

You can also let the server auto-create the table by leaving `FACTS_AUTO_MIGRATE` unset or set to anything other than `false`.

## Short IDs

Facts get a short ID like `F000123` in addition to the UUID. Use the short ID for update/delete to keep LLM calls small and stable.

## Run

```bash
npm run dev
```

### Run as Streamable HTTP (for Onyx MCP Actions)

Set environment variables and run the server as an HTTP service:

```bash
MCP_TRANSPORT=http MCP_HOST=0.0.0.0 MCP_PORT=3005 npm run dev
```

Then use this in your MCP Actions UI:

- **Server URL**: `http://<server-ip>:3005/mcp`
- **Transport**: Streamable HTTP
- **Auth**: None (or set `MCP_API_KEY` and pass it as `x-api-key` or `Authorization: Bearer ...`)

If you bind to `0.0.0.0`, consider setting `MCP_ALLOWED_HOSTS` (comma-separated) and/or using `MCP_API_KEY`.

### Debug logging

Set `FACTS_LOG_LEVEL=debug` to get structured logs for:

- MCP session lifecycle (`mcp.session.*`)
- incoming MCP requests (`http.request.*`)
- tool calls (`tool.call.*`)
- DB write/list events (`facts.*`, `db.*`)

On Linux/systemd:

```bash
journalctl -u mcp-facts-server -f
```

## Tools

### `store_fact`
Input:

```json
{
  "roomId": "ROOM-ABC123",
  "fact": "Reservoir storage is at 28% of capacity."
}
```

Optional `source` and `createdBy` can be included if you have them.
`roomId` can be either:
- the app room ID (`public.rooms.id`)
- or the linked Onyx session ID (`public.rooms.onyx_session_id`)

### `list_facts`
Input:

```json
{
  "roomId": "ROOM-ABC123",
  "limit": 50,
  "offset": 0
}
```

Each fact returns `id`, `shortId`, and a `summary` sentence like:

```
[F000123] Reservoir storage is at 28% of capacity — By: Narrator — Source: Water agency bulletin
```

### `update_fact`
Input (update any subset of fields):

```json
{
  "id": "F000123",
  "fact": "Reservoir storage is at 29% of capacity.",
  "source": "Updated water agency bulletin",
  "createdBy": "Narrator"
}
```

### `delete_fact`
Input:

```json
{
  "id": "F000123"
}
```

## Verify Storage (optional)

```bash
FACTS_TEST_ROOM_ID=ROOM-ABC123 npm run verify
```

## Example MCP client config (stdio)

```json
{
  "mcpServers": {
    "facts": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-facts-server/dist/src/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "FACTS_AUTO_MIGRATE": "false"
      }
    }
  }
}
```

## Systemd service (HTTP)

Create `/etc/mcp-facts-server.env`:

```
DATABASE_URL=postgresql://...
DB_SSL=true
FACTS_AUTO_MIGRATE=false
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_PORT=3005
NODE_OPTIONS=--dns-result-order=ipv4first
FACTS_LOG_LEVEL=info
# MCP_API_KEY=change-me
# MCP_ALLOWED_HOSTS=your-domain.com
```

Create `/etc/systemd/system/mcp-facts-server.service`:

```
[Unit]
Description=MCP Facts Server (HTTP)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/kic_admin/mcp-facts-server
ExecStart=/usr/bin/node /home/kic_admin/mcp-facts-server/dist/src/index.js
EnvironmentFile=/etc/mcp-facts-server.env
Restart=always
RestartSec=3
User=kic_admin
Group=kic_admin

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-facts-server
sudo systemctl start mcp-facts-server
```
