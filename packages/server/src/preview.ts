import { createHash } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { serverFetch, SsrfError } from 'server-fetch';

import { logger } from './logging.js';
import { mediaWikiHeaders, readMediaWikiJsonResult } from './mediawiki-http.js';

const REMOTE_PREVIEW_CACHE_TTL_MS = 30_000;
const REMOTE_PREVIEW_THROTTLE_MS = 1_500;
const REMOTE_PREVIEW_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_REMOTE_PREVIEW_CACHE_ENTRIES = 100;
const MAX_REMOTE_PREVIEW_QUEUE_DEPTH = 5;

const remotePreviewCache = new Map<string, { html: string; expiresAt: number }>();
const remotePreviewLatestByTarget = new Map<string, { html: string; expiresAt: number }>();
const remotePreviewPending = new Map<string, Promise<RemotePreviewResult>>();
const remotePreviewLastRequest = new Map<string, number>();
const remotePreviewRateLimitUntil = new Map<string, number>();
const remotePreviewTargetQueues = new Map<string, Promise<unknown>>();
const remotePreviewTargetQueueDepth = new Map<string, number>();
let remotePreviewPendingJoinObserver: (() => void) | null = null;

type RemotePreviewResult =
  { status: 'ok'; html: string } | { status: 'rate_limited'; html?: string } | { status: 'broken' };

function remotePreviewKey(
  apiUrl: string,
  page: string | null | undefined,
  wikitext: string
): string {
  return createHash('sha256')
    .update(`${apiUrl}\0${page || ''}\0${wikitext}`)
    .digest('base64url');
}

function remotePreviewTargetKey(apiUrl: string, page: string | null | undefined): string {
  return `${apiUrl}\0${page || ''}`;
}

function remotePreviewLatestKey(
  apiUrl: string,
  page: string | null | undefined,
  documentId: string | null | undefined
): string | null {
  return documentId ? `${apiUrl}\0${page || ''}\0${documentId}` : null;
}

function evictRemotePreviewCache(now: number): void {
  for (const [key, value] of remotePreviewCache) {
    if (value.expiresAt <= now) remotePreviewCache.delete(key);
  }
  for (const [key, value] of remotePreviewLatestByTarget) {
    if (value.expiresAt <= now) remotePreviewLatestByTarget.delete(key);
  }
  for (const [key, lastRequest] of remotePreviewLastRequest) {
    if (lastRequest + REMOTE_PREVIEW_CACHE_TTL_MS <= now) remotePreviewLastRequest.delete(key);
  }
  for (const [key, rateLimitUntil] of remotePreviewRateLimitUntil) {
    if (rateLimitUntil <= now) remotePreviewRateLimitUntil.delete(key);
  }
  while (remotePreviewCache.size > MAX_REMOTE_PREVIEW_CACHE_ENTRIES) {
    const oldest = remotePreviewCache.keys().next().value;
    if (!oldest) break;
    remotePreviewCache.delete(oldest);
  }
  while (remotePreviewLatestByTarget.size > MAX_REMOTE_PREVIEW_CACHE_ENTRIES) {
    const oldest = remotePreviewLatestByTarget.keys().next().value;
    if (!oldest) break;
    remotePreviewLatestByTarget.delete(oldest);
  }
  while (remotePreviewLastRequest.size > MAX_REMOTE_PREVIEW_CACHE_ENTRIES) {
    const oldest = remotePreviewLastRequest.keys().next().value;
    if (!oldest) break;
    remotePreviewLastRequest.delete(oldest);
  }
  while (remotePreviewRateLimitUntil.size > MAX_REMOTE_PREVIEW_CACHE_ENTRIES) {
    const oldest = remotePreviewRateLimitUntil.keys().next().value;
    if (!oldest) break;
    remotePreviewRateLimitUntil.delete(oldest);
  }
}

export function resetRemotePreviewStateForTests(): void {
  remotePreviewCache.clear();
  remotePreviewLatestByTarget.clear();
  remotePreviewPending.clear();
  remotePreviewLastRequest.clear();
  remotePreviewRateLimitUntil.clear();
  remotePreviewTargetQueues.clear();
  remotePreviewTargetQueueDepth.clear();
  remotePreviewPendingJoinObserver = null;
}

export function setRemotePreviewPendingJoinObserverForTests(observer: (() => void) | null): void {
  remotePreviewPendingJoinObserver = observer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Decodes CSS escapes before filtering so obfuscated javascript URLs are still caught. */
function decodeCssEscape(value: string): string {
  return value
    .replace(/\\(?:\r\n|[\n\r\f])/g, '')
    .replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_match, hex, char) => {
      if (hex !== undefined) {
        const cp = Number.parseInt(hex, 16);
        if (cp > 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
        return '';
      }
      return char;
    });
}

/** Strips the most common script execution vectors from inline style attributes. */
function sanitizeStyle(value: string): string {
  let normalized = value;
  for (let i = 0; i < 5; i++) {
    const decoded = decodeCssEscape(normalized);
    if (decoded === normalized) break;
    normalized = decoded;
  }
  return (
    normalized
      // Intentional escape-bypass hardening; this may alter legitimate CSS escapes.
      .replace(/\\/g, '')
      .replace(/@import\b[^;]*(?:;|$)/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/expression\s*\(/gi, '')
      .replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(')
      .replace(/url\s*\(\s*(['"]?)(?!data:|#)[^)]+\1\s*\)/gi, 'url()')
      .replace(/-moz-binding\s*:[^;]*(?:;|$)/gi, '')
      .replace(/behavior\s*:[^;]*(?:;|$)/gi, '')
  );
}

function sanitizeStyleBlocks(html: string): string {
  return html.replace(
    /<style\b([^>]*)>([\s\S]*?)(?:<\/style\s*>|$)/gi,
    (_match, attrs, css) => `<style${attrs}>${sanitizeStyle(css).replace(/<\/style/gi, '')}</style>`
  );
}

function stripStyleBlocks(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)/gi, '');
}

/** Sanitizes parser HTML while preserving MediaWiki markup needed by the preview UI. */
function sanitize(html: string, allowStyleTags = false): string {
  const allowedTags = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'colgroup',
    'col',
    'a',
    'img',
    'b',
    'i',
    'u',
    'strong',
    'em',
    'small',
    'big',
    'sub',
    'sup',
    's',
    'del',
    'ins',
    'mark',
    'span',
    'abbr',
    'cite',
    'code',
    'kbd',
    'var',
    'samp',
    'div',
    'ref',
    'gallery',
    'math',
    'score',
    'nowiki',
    'syntaxhighlight',
    'choose',
    'when',
    'otherwise',
  ];

  return sanitizeHtml(html, {
    allowedTags: allowStyleTags ? [...allowedTags, 'style'] : allowedTags,
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'title', 'lang', 'dir'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan', 'valign', 'align', 'width', 'height', 'scope', 'abbr'],
      th: ['colspan', 'rowspan', 'valign', 'align', 'width', 'height', 'scope', 'abbr'],
      col: ['span', 'width'],
      colgroup: ['span'],
      div: ['data-mw-fallback'],
      ol: ['start', 'type', 'reversed'],
      li: ['value'],
      style: ['data-mw-deduplicate'],
    },
    allowVulnerableTags: allowStyleTags,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.target === '_blank') {
          return { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } };
        }
        return { tagName, attribs };
      },
      '*': (tagName, attribs) => {
        if (attribs.style) {
          return { tagName, attribs: { ...attribs, style: sanitizeStyle(attribs.style) } };
        }
        return { tagName, attribs };
      },
    },
    disallowedTagsMode: 'discard',
  });
}

/** Preview payload returned to HTTP and WebSocket callers. */
export interface PreviewResult {
  html: string;
}

export interface PreviewMarkerRequest {
  id: string;
  userName: string;
  color: string;
  anchor: number;
  head: number;
}

const markerIdPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const markerColorPattern = /^#[0-9a-fA-F]{3,8}$/;

function markerSpan(markerId: string): string {
  return `<span class="wc-marker" id="${markerId}"></span>`;
}

function normalizeMarkerRequests(
  markerRequests?: PreviewMarkerRequest[] | null,
  sourceLength = 0
): PreviewMarkerRequest[] {
  if (!markerRequests?.length) return [];
  const seen = new Set<string>();
  const normalized: PreviewMarkerRequest[] = [];
  for (const marker of markerRequests.slice(0, 25)) {
    if (!markerIdPattern.test(marker.id) || seen.has(marker.id)) continue;
    if (!markerColorPattern.test(marker.color)) continue;
    const anchor = Math.max(0, Math.min(sourceLength, Math.trunc(marker.anchor)));
    const head = Math.max(0, Math.min(sourceLength, Math.trunc(marker.head)));
    normalized.push({
      id: marker.id,
      userName: marker.userName.slice(0, 80),
      color: marker.color,
      anchor,
      head,
    });
    seen.add(marker.id);
  }
  return normalized;
}

function findTemplateRange(
  source: string,
  start: number,
  end: number
): { start: number; end: number } | null {
  let open = -1;
  let depth = 0;
  for (let i = 0; i < source.length - 1; i++) {
    const pair = source.slice(i, i + 2);
    if (pair === '{{') {
      if (depth === 0) open = i;
      depth++;
      i++;
    } else if (pair === '}}' && depth > 0) {
      depth--;
      const close = i + 2;
      if (depth === 0 && open !== -1) {
        if (Math.max(start, open) <= Math.min(end, close)) return { start: open, end: close };
        open = -1;
      }
      i++;
    }
  }
  return null;
}

export function instrumentPreviewWikitext(
  source: string,
  markerRequests?: PreviewMarkerRequest[] | null
): string {
  const markers = normalizeMarkerRequests(markerRequests, source.length);
  if (!markers.length) return source;

  const insertions = new Map<number, string[]>();
  const addInsertion = (offset: number, html: string) => {
    const values = insertions.get(offset) || [];
    values.push(html);
    insertions.set(offset, values);
  };

  for (const marker of markers) {
    const start = Math.min(marker.anchor, marker.head);
    const end = Math.max(marker.anchor, marker.head);
    if (start === end) {
      addInsertion(start, markerSpan(`${marker.id}:caret`));
    } else {
      addInsertion(start, markerSpan(`${marker.id}:start`));
      addInsertion(end, markerSpan(`${marker.id}:end`));
    }
    const templateRange = findTemplateRange(source, start, end);
    if (templateRange) {
      addInsertion(templateRange.start, markerSpan(`${marker.id}:template-start`));
      addInsertion(templateRange.end, markerSpan(`${marker.id}:template-end`));
    }
  }

  let instrumented = '';
  for (let index = 0; index <= source.length; index++) {
    const values = insertions.get(index);
    if (values) instrumented += values.join('');
    if (index < source.length) instrumented += source[index];
  }
  return instrumented;
}

async function fetchRemotePreview(
  apiUrl: string,
  wikitext: string,
  page?: string | null,
  documentId?: string | null
): Promise<RemotePreviewResult> {
  const now = Date.now();
  evictRemotePreviewCache(now);

  const cacheKey = remotePreviewKey(apiUrl, page, wikitext);
  const targetKey = remotePreviewTargetKey(apiUrl, page);
  const latestKey = remotePreviewLatestKey(apiUrl, page, documentId);
  const cached = remotePreviewCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    if (latestKey) remotePreviewLatestByTarget.set(latestKey, cached);
    return { status: 'ok', html: cached.html };
  }

  const pending = remotePreviewPending.get(cacheKey);
  if (pending) {
    remotePreviewPendingJoinObserver?.();
    return resolveRemotePreviewForTarget(pending, latestKey);
  }

  const latest = latestKey ? remotePreviewLatestByTarget.get(latestKey) : undefined;
  const depth = remotePreviewTargetQueueDepth.get(targetKey) || 0;
  if (depth >= MAX_REMOTE_PREVIEW_QUEUE_DEPTH) {
    return latest && latest.expiresAt > now
      ? { status: 'rate_limited', html: latest.html }
      : { status: 'rate_limited' };
  }
  remotePreviewTargetQueueDepth.set(targetKey, depth + 1);

  const request = (remotePreviewTargetQueues.get(targetKey) || Promise.resolve())
    .catch(() => {})
    .then(async (): Promise<RemotePreviewResult> => {
      const queuedAt = Date.now();
      const queuedRateLimitUntil = remotePreviewRateLimitUntil.get(targetKey) || 0;
      if (queuedRateLimitUntil > queuedAt) return { status: 'rate_limited' };

      const lastRequest = remotePreviewLastRequest.get(targetKey) || 0;
      const waitMs = Math.max(0, REMOTE_PREVIEW_THROTTLE_MS - (Date.now() - lastRequest));
      if (waitMs > 0) await delay(waitMs);
      const requestTime = Date.now();
      const rateLimitUntil = remotePreviewRateLimitUntil.get(targetKey) || 0;
      if (rateLimitUntil > requestTime) return { status: 'rate_limited' };
      remotePreviewLastRequest.set(targetKey, requestTime);

      const formData = new URLSearchParams();
      formData.append('action', 'parse');
      formData.append('text', wikitext);
      formData.append('prop', 'text');
      formData.append('contentmodel', 'wikitext');
      formData.append('format', 'json');
      if (page) {
        formData.append('title', page);
      }

      const res = await serverFetch(apiUrl, {
        method: 'POST',
        headers: mediaWikiHeaders({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: formData.toString(),
      });

      const result = await readMediaWikiJsonResult<{
        parse?: { text?: { '*': string } };
        error?: { code?: string; info: string };
      }>(res, 'preview');

      if (result.rateLimited || result.data?.error?.code === 'ratelimited') {
        const cooldownMs = Math.max(
          0,
          result.retryAfterMs ?? REMOTE_PREVIEW_RATE_LIMIT_COOLDOWN_MS
        );
        remotePreviewRateLimitUntil.set(targetKey, Date.now() + cooldownMs);
        return { status: 'rate_limited' };
      }

      const html = result.data?.parse?.text?.['*'];
      if (!html) return { status: 'broken' };

      const expiresAt = Date.now() + REMOTE_PREVIEW_CACHE_TTL_MS;
      remotePreviewCache.set(cacheKey, { html, expiresAt });
      if (latestKey) remotePreviewLatestByTarget.set(latestKey, { html, expiresAt });
      return { status: 'ok', html };
    })
    .catch((err): RemotePreviewResult => {
      if (err instanceof SsrfError) throw err;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'MediaWiki preview request failed; treating instance as broken'
      );
      return { status: 'broken' };
    });

  remotePreviewPending.set(cacheKey, request);
  remotePreviewTargetQueues.set(targetKey, request);
  try {
    return await resolveRemotePreviewForTarget(request, latestKey);
  } finally {
    remotePreviewPending.delete(cacheKey);
    const currentDepth = remotePreviewTargetQueueDepth.get(targetKey) || 0;
    if (currentDepth <= 1) {
      remotePreviewTargetQueueDepth.delete(targetKey);
    } else {
      remotePreviewTargetQueueDepth.set(targetKey, currentDepth - 1);
    }
    if (remotePreviewTargetQueues.get(targetKey) === request) {
      remotePreviewTargetQueues.delete(targetKey);
    }
  }
}

async function resolveRemotePreviewForTarget(
  request: Promise<RemotePreviewResult>,
  latestKey: string | null
): Promise<RemotePreviewResult> {
  const result = await request;
  if (result.status === 'ok' && latestKey) {
    remotePreviewLatestByTarget.set(latestKey, {
      html: result.html,
      expiresAt: Date.now() + REMOTE_PREVIEW_CACHE_TTL_MS,
    });
  }
  if (result.status !== 'rate_limited') return result;

  const latest = latestKey ? remotePreviewLatestByTarget.get(latestKey) : undefined;
  return latest && latest.expiresAt > Date.now()
    ? { status: 'rate_limited', html: latest.html }
    : result;
}

/**
 * Generates sanitized preview HTML and a coarse source map.
 * Uses the configured MediaWiki parser when available. Rate limits never fall
 * back to local parsing; broken instance/API failures do.
 */
export async function generatePreview(
  wikitext?: string | null,
  api_url?: string | null,
  page?: string | null,
  documentId?: string | null,
  markerRequests?: PreviewMarkerRequest[] | null
): Promise<PreviewResult> {
  const Parser = (await import('wikiparser-node')).default;
  const previewWikitext = instrumentPreviewWikitext(wikitext || '', markerRequests);

  if (api_url) {
    try {
      const remotePreview = await fetchRemotePreview(api_url, previewWikitext, page, documentId);
      if ('html' in remotePreview && remotePreview.html) {
        return { html: sanitize(sanitizeStyleBlocks(remotePreview.html), true) };
      }
      if (remotePreview.status === 'rate_limited') {
        return {
          html: sanitize(
            '<div class="mw-preview-status">Remote wiki preview is temporarily rate limited. Waiting before retrying...</div>'
          ),
        };
      }
    } catch (err) {
      if (err instanceof SsrfError) {
        logger.error({ url: err.url }, 'SSRF blocked in preview');
      } else {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'MediaWiki preview request failed; falling back because instance appears broken'
        );
      }
    }
  }

  const html = Parser.toHtml(previewWikitext, false, undefined, page || undefined);
  return { html: sanitize(stripStyleBlocks(html)) };
}
