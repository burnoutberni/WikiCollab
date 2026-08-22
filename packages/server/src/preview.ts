import { createHash } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { serverFetch, SsrfError } from 'server-fetch';
import type wikiparser from 'wikiparser-node';

import { mediaWikiHeaders, readMediaWikiJsonResult } from './mediawiki-http.js';

interface SourceMapEntry {
  sourceLine: number;
  blockIndex: number;
}

const REMOTE_PREVIEW_CACHE_TTL_MS = 30_000;
const REMOTE_PREVIEW_THROTTLE_MS = 1_500;
const MAX_REMOTE_PREVIEW_CACHE_ENTRIES = 100;
const MAX_REMOTE_PREVIEW_QUEUE_DEPTH = 5;

const remotePreviewCache = new Map<string, { html: string; expiresAt: number }>();
const remotePreviewLatestByTarget = new Map<string, { html: string; expiresAt: number }>();
const remotePreviewPending = new Map<string, Promise<RemotePreviewResult>>();
const remotePreviewLastRequest = new Map<string, number>();
const remotePreviewTargetQueues = new Map<string, Promise<unknown>>();
const remotePreviewTargetQueueDepth = new Map<string, number>();

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
}

export function resetRemotePreviewStateForTests(): void {
  remotePreviewCache.clear();
  remotePreviewLatestByTarget.clear();
  remotePreviewPending.clear();
  remotePreviewLastRequest.clear();
  remotePreviewTargetQueues.clear();
  remotePreviewTargetQueueDepth.clear();
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
  return normalized
    .replace(/\\/g, '')
    .replace(/@import\b[^;]*(?:;|$)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(')
    .replace(/-moz-binding\s*:[^;]*(?:;|$)/gi, '')
    .replace(/behavior\s*:[^;]*(?:;|$)/gi, '');
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

type ParserRoot = Awaited<ReturnType<typeof wikiparser.default.parse>>;

/** Maps rendered parser blocks back to source lines, skipping empty or zero-height nodes. */
function generateSourceMap(root: ParserRoot): SourceMapEntry[] {
  const sourceMap: SourceMapEntry[] = [];
  let blockIndex = 0;

  for (const child of root.childNodes) {
    if (child.type === 'text') {
      const text = child.toString().trim();
      if (!text) continue;
    }
    const rect = child.getBoundingClientRect();
    if (rect.height === 0) continue;
    sourceMap.push({
      sourceLine: rect.top,
      blockIndex,
    });
    blockIndex++;
  }

  return sourceMap;
}

/** Preview payload returned to HTTP and WebSocket callers. */
export interface PreviewResult {
  html: string;
  sourceMap: SourceMapEntry[];
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
  if (cached && cached.expiresAt > now) return { status: 'ok', html: cached.html };

  const pending = remotePreviewPending.get(cacheKey);
  if (pending) return resolveRemotePreviewForTarget(pending, latestKey);

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
      const lastRequest = remotePreviewLastRequest.get(targetKey) || 0;
      const waitMs = Math.max(0, REMOTE_PREVIEW_THROTTLE_MS - (Date.now() - lastRequest));
      if (waitMs > 0) await delay(waitMs);
      remotePreviewLastRequest.set(targetKey, Date.now());

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

      if (result.rateLimited || result.data?.error?.code === 'ratelimited')
        return { status: 'rate_limited' };

      const html = result.data?.parse?.text?.['*'];
      if (!html) return { status: 'broken' };

      const expiresAt = Date.now() + REMOTE_PREVIEW_CACHE_TTL_MS;
      remotePreviewCache.set(cacheKey, { html, expiresAt });
      if (latestKey) remotePreviewLatestByTarget.set(latestKey, { html, expiresAt });
      return { status: 'ok', html };
    })
    .catch((err): RemotePreviewResult => {
      if (err instanceof SsrfError) throw err;
      console.warn('MediaWiki preview request failed; treating instance as broken.', err);
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
  documentId?: string | null
): Promise<PreviewResult> {
  const Parser = (await import('wikiparser-node')).default;
  const root = Parser.parse(wikitext || '', page || 'API');
  const sourceMap = generateSourceMap(root);

  if (api_url) {
    try {
      const remotePreview = await fetchRemotePreview(api_url, wikitext || '', page, documentId);
      if ('html' in remotePreview && remotePreview.html) {
        return { html: sanitize(sanitizeStyleBlocks(remotePreview.html), true), sourceMap };
      }
      if (remotePreview.status === 'rate_limited') {
        return {
          html: sanitize(
            '<div class="mw-preview-status">Remote wiki preview is temporarily rate limited. Waiting before retrying...</div>'
          ),
          sourceMap,
        };
      }
    } catch (err) {
      if (err instanceof SsrfError) {
        console.error(`SSRF blocked: ${err.url}`);
      } else {
        console.warn(
          'MediaWiki preview request failed; falling back because instance appears broken.',
          err
        );
      }
    }
  }

  const html = Parser.toHtml(wikitext || '', false, undefined, page || undefined);
  return { html: sanitize(stripStyleBlocks(html)), sourceMap };
}
