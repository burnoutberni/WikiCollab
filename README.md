# WikiCollab

A collaborative wikitext editor with real-time preview and MediaWiki integration.

## Features

- **Real-time collaboration** via Yjs WebSocket — multiple users edit simultaneously
- **Live preview** rendered through the MediaWiki `action=parse` API (handles templates, Lua modules, parser functions), with local wikiparser-node fallback when no instance is configured
- **Version history** with restore and star support
- **MediaWiki instance config** stored per document, editable only by its owner
- **Start from a wiki article** by searching a Wikimedia/public MediaWiki site or pasting an article/revision URL; imports wikitext and automatically connects the source wiki
- **Configurable OAuth 2.0 login** and encrypted document-scoped MediaWiki Bot Password or bearer-token authentication
- **Push to Wiki** (not yet implemented)

### Importing wiki articles

Choose **New Document → Start from a wiki article**. Type in the single search field for
automatic suggestions from Wikipedia only. The language picker in the suggestions
uses Wikimedia's language names and autonyms, defaults to your browser language when available,
and switches language versions without retyping your query. Selecting a result immediately
creates a public document named after the source page; you can rename it or change visibility
in the editor as usual.

Paste or type an article URL, then press Enter or choose **Import article** to confirm,
including URLs from other public MediaWiki sites. Ordinary links load the latest revision;
`oldid` links and revision permalinks load that exact revision.

For custom installations, WikiCollab checks standard API locations and the page's advertised
`EditURI`. The API must allow
anonymous reads. Only wikitext pages are supported, not binary files, Wikidata entities,
or other non-wikitext content models. Document text has no character-count limit.

The source revision is copied into an independent document, with source attribution saved
and available in its settings. The source wiki is configured for previews, but importing does
not synchronize changes or publish anything back. Source licensing and attribution requirements
still apply. Import/search requests require a WikiCollab login and use bounded, rate-limited,
SSRF-protected server-side requests without forwarding wiki credentials.

## Authenticated preview security model

WikiCollab intentionally shares rendered previews with **all document collaborators**, including
people who do not have an account on the configured wiki. To produce these previews, WikiCollab
uses the document owner's configured Bot Password or bearer token **only on the server**.
Collaborators do not receive the raw password, bearer token, session cookie, or auth headers.
However, **the rendered HTML can contain private wiki content** (including transcluded pages
accessible to the credential). Treat a link to a document with authenticated previews as
permission to see that content. Do not attach an all-access account: create a dedicated,
least-privilege bot identity and configure only documents whose collaborators you trust.
Unlisted links are not access controls. WikiCollab sanitises preview HTML and CSS but cannot
undo content exposure through deliberately requested wiki transclusions.

Credential-backed connections require HTTPS, reject HTTP downgrades and do not follow
cross-origin redirects. Preview caches separate authenticated contexts. Never paste bot
credentials into wikitext or document titles; the server stores them encrypted and only the
owner can configure them. Anonymous MediaWiki instances can still use HTTP.

## Getting Started

```bash
cp .env.example .env
# Edit .env: uncomment and set the five required OAuth/session/encryption values.
pnpm install
pnpm dev
```

You **must** set `OAUTH_CONSUMER_KEY`, `OAUTH_CONSUMER_SECRET`, `OAUTH_CALLBACK_URL`, `SESSION_SECRET`, and `ENCRYPTION_KEY` to real nonempty values. Generate the encryption key with `openssl rand -base64 32` (it must decode to exactly 32 bytes). The server refuses to start without them.

Logout reloads the current page, preserving the document URL. The default OAuth provider is Wikimedia. For another OAuth 2.0 provider, configure `OAUTH_ISSUER`, `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL`, `OAUTH_PROFILE_URL`, and optionally `OAUTH_SCOPE`, `OAUTH_SUBJECT_FIELD`, `OAUTH_USERNAME_FIELD`. The profile response must contain the configured subject and username properties; the provider must support authorization-code PKCE and client-secret authentication. Set `OAUTH_PROVIDER_NAME` (default `Wikimedia`) to generate login/logout button and tooltip text automatically. Existing login accounts are keyed by the OAuth subject; changing providers on an existing database requires planning an account migration.

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
