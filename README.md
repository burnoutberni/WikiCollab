# WikiCollab

A collaborative wikitext editor with real-time preview and MediaWiki integration.

## Features

- **Real-time collaboration** via Yjs WebSocket — multiple users edit simultaneously
- **Live preview** rendered through the MediaWiki `action=parse` API (handles templates, Lua modules, parser functions), with local wikiparser-node fallback when no instance is configured
- **Version history** with restore and star support
- **MediaWiki instance config** stored per-browser in localStorage
- **Push to Wiki** (not yet implemented — authentication pending)

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser.

## Deployment

### Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

At minimum, set these for production:

- `CORS_ORIGINS` — your production domain(s), e.g. `https://wiki.example.com`
- `TRUSTED_PROXIES` — see below

### Reverse Proxy & Trusted Proxies

When deploying behind a reverse proxy (Caddy, nginx, Cloudflare, Railway, etc.), the server
sees the proxy's IP instead of the real client IP. **Set the `TRUSTED_PROXIES` environment variable** so rate limiting
and IP logging use the correct client address:

```bash
# Caddy / nginx / generic (internal Docker networks)
TRUSTED_PROXIES=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16

# Single known proxy IP
TRUSTED_PROXIES=203.0.113.10
```

Without this, **all traffic is treated as coming from the proxy IP** and rate limits are shared across all users.

## Project Structure

```
packages/
  client/    — React SPA
  server/    — Hono API + WebSocket server
  shared/    — Shared types, schemas, and utilities
```

## Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Yjs, CodeMirror 6
- **Backend**: Hono, better-sqlite3, Yjs WebSocket

## Demo instance

A free hosted instance is available at [wikicollab.bhayden.at](https://wikicollab.bhayden.at). Content may be deleted at any time — do not rely on it for important work.

## Contributors

Created by [Bernhard Hayden](https://bhayden.at) ([@burnoutberni](https://github.com/burnoutberni)).

Contributions are welcome — open an issue, [pick up an existing one](https://github.com/burnoutberni/WikiCollab/issues), or send a pull request.

## License

[AGPL-3.0](LICENSE)
