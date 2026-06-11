# WikiCollab

A collaborative wikitext editor with real-time preview and MediaWiki integration.

## Features

- **Real-time collaboration** via Yjs WebSocket — multiple users edit simultaneously
- **Wikitext editor** with syntax highlighting
- **Live preview** rendered through the MediaWiki `action=parse` API (handles templates, Lua modules, parser functions)
- **Version history** with restore and star support
- **Custom slugs** for shareable document URLs
- **MediaWiki instance config** stored per-browser in localStorage
- **Push to Wiki** (not yet implemented — authentication pending)

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser.

## Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Yjs
- **Backend**: Hono, better-sqlite3, Yjs WebSocket

## Project Structure

```
packages/
  client/    — React SPA
  server/    — Hono API + WebSocket server
```

## License

[AGPL-3.0](LICENSE)
