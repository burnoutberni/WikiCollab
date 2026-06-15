# Cluster 4: Testing

**Issue:** #11 — Write API endpoint tests, database tests, WebSocket tests

---

## Overview

The codebase already has some test coverage (see existing tests below). This issue aims to fill in the gaps systematically.

### Existing test files (for reference — do NOT re-implement these)

**Server:**
- `packages/server/src/test/setup.ts` — In-memory SQLite test DB factory
- `packages/server/src/test/db.test.ts` — Schema CRUD, foreign key constraints
- `packages/server/src/test/routes/docs.test.ts` (492 lines) — Full docs route integration tests
- `packages/server/src/test/routes/validation.test.ts` (388 lines) — Input validation
- `packages/server/src/test/routes/preview.test.ts` (384 lines) — HTML sanitization
- `packages/server/src/test/middleware/rate-limit.test.ts` (123 lines) — Rate limiter
- `packages/server/src/test/middleware/security-headers.test.ts` (112 lines) — Security headers
- `packages/server/src/test/ws/origin.test.ts` (160 lines) — Origin validation
- `packages/server/src/test/mocks/websocket.ts` — Mock WebSocket factory

**Client:**
- `packages/client/src/test/setup.ts` (47 lines)
- `packages/client/src/test/mocks/yjs.ts` (89 lines)
- `packages/client/src/test/mocks/websocket.ts` (35 lines)
- `packages/client/src/lib/utils.test.ts` (25 lines)
- `packages/client/src/components/ShareButton.test.tsx` (41 lines)
- `packages/client/src/components/InstanceManager.test.tsx` (130 lines)
- `packages/client/src/components/ui/button.test.tsx` (60 lines)

**Shared:**
- `shared/src/index.test.ts` (174 lines) — Types, replaceYText, message protocol

---

## Requirements

### 1. Server: WebSocket Tests (HIGH priority — missing coverage)

Create `packages/server/src/test/ws/connection.test.ts` covering:

- **Connection establishment:** Basic connect/disconnect, valid vs. invalid doc names
- **Yjs sync protocol:** Sync step 1 (awareness), sync step 2 (document state)
- **Awareness protocol:** Cursor position updates, user presence (join/leave)
- **Custom messages:**
  - `star` — star a version via WebSocket
  - `restore` — restore a version via WebSocket
  - `preview_request` — request preview (with 500ms debounce verification)
  - `new_version` — broadcast on save
- **Rate limiting:**
  - Concurrent connections per IP (`RATE_LIMIT_WS_CONCURRENT`)
  - Rate per IP (`RATE_LIMIT_WS_RATE_MAX` / `RATE_LIMIT_WS_RATE_WINDOW`)
- **Persistence:** Verify Yjs document state is persisted to database on disconnect
- **Multiple concurrent clients:** 2-3 clients editing the same document, verify sync
- **Error handling:** Invalid messages, malformed data, closed connections

**Tools:** `vitest` + `ws` client library (already a dependency). Use `packages/server/src/test/mocks/websocket.ts` as reference.

### 2. Server: DB tests — verify existing coverage is sufficient

Check `packages/server/src/test/db.test.ts` (123 lines). Add tests for:
- Concurrent access with WAL mode (if not already tested)
- Document expiry cleanup
- Cascade deletes when a document is deleted (versions should be deleted too)

### 3. Server: API endpoint tests — verify existing coverage is sufficient

Check `packages/server/src/test/routes/docs.test.ts` (469 lines). Verify these are covered:
- [x] Create document
- [x] Read document
- [x] Update document
- [x] Delete document
- [x] List versions (GET /:id/versions) — tested
- [x] Star/unstar version
- [x] Restore version
- [x] Version preview
- [x] Push to wiki (mock the external API call)
- [x] Error cases: 404, invalid input, missing fields

Add any missing test cases.

### 4. Client: Component tests (MEDIUM priority)

Add tests for components that currently lack coverage:

- **`Dashboard.tsx`** — document list rendering, search, sort, create dialog
- **`DocumentEditor.tsx`** — renders with valid doc ID, shows loading/error states
- **`SplitPaneEditor.tsx`** — split view rendering, toggle between source/preview
- **`PreviewLinkModal.tsx`** — open/close behavior, link click handling
- **`VersionHistory.tsx`** — version list, star/unstar, restore actions
- **`WikitextEditor.tsx`** — basic rendering (mocking Yjs/codemirror is complex, test at integration level)

### 5. Client: Hook tests (MEDIUM priority)

- **`useApi.ts`** — test that API hooks call the correct endpoints and handle responses/errors
- **`useYjs.ts`** — test WebSocket provider setup, awareness, custom message handling (mock y-websocket)
- **`useEditorLock.ts`** — test tab locking via localStorage

### 6. Integration: Cross-package tests

At minimum, ensure that the shared package's protocol (`shared/src/protocol.ts`) roundtrips correctly between client and server message formats. Already partially tested in `shared/src/index.test.ts` — verify coverage is complete.

---

## Test Infrastructure Notes

- Server tests use `vitest` with `environment: 'node'`
- Client tests use `vitest` with `environment: 'jsdom'` (configured in `vite.config.ts`)
- Database tests use in-memory SQLite via `packages/server/src/test/setup.ts`
- Mock external MediaWiki API calls (for push-to-wiki tests)
- For WebSocket tests, use the `ws` library to create client connections to the test server
- Follow existing patterns in `packages/server/src/test/routes/docs.test.ts` for server tests

---

## Verification

- `pnpm test` passes across all packages
- `pnpm test:coverage` shows improved coverage
- No flaky tests (run `pnpm test` 3x to verify)

## Acceptance criteria

- [ ] WebSocket connection, sync, awareness, and custom message tests exist
- [ ] WebSocket rate limiting tests exist
- [ ] All existing tests still pass
- [ ] Client component tests for Dashboard, DocumentEditor, SplitPaneEditor, VersionHistory
- [ ] Hook tests for useApi and useYjs
- [ ] `pnpm test --run` passes consistently
