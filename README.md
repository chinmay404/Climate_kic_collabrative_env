# Collaborative Chat Interface

This is a Next.js collaborative chat application. It allows multiple users to chat in a shared room with synchronized messages.

## Features

- **Real-time Synchronization**: Messages update across all active windows (polling mechanism).
- **Collaborative**: Single shared conversation history.
- **External API Integration**: Capability to forward messages to an external AI/API endpoint.
- **Minimal UI**: Clean, simple interface.

## Getting Started

1.  install dependencies:
    ```bash
    npm install
    ```

2.  Run the development server:
    ```bash
    npm run dev
    ```

3.  Open [http://localhost:3000](http://localhost:3000) with your browser. Open it in multiple tabs/windows to test synchronization.

## Configuration

To connect to your Onyx AI endpoint, create a `.env.local` file in the root directory (do not commit it):

```env
# Base URL for the Onyx API
EXTERNAL_CHAT_ENDPOINT=https://your-onyx-host.example/api

# Your Onyx API Key
ONYX_API_KEY=your_api_key_here

# ID of the specific Onyx Agent (Persona) to use
# Default is 0. Check your Onyx admin URL for other IDs (e.g. /admin/personas/123)
ONYX_PERSONA_ID=0
```

## Persistence

Chat history and room data are stored in `chat_db.json` in the root directory.

Supabase/Postgres persistence foundation is available in:

- `docs/supabase-persistence.md`
- `supabase/migrations/202602130001_init.sql`

## Rooms

- Users can create a new room (generating a unique ID).
- Users can join an existing room using the ID.
- Onyx sessions are attached to rooms, so each room has its own AI context.
