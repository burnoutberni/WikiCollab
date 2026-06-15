import sanitizeHtml from 'sanitize-html';
import { serverFetch, SsrfError } from 'server-fetch';
import type wikiparser from 'wikiparser-node';

interface SourceMapEntry {
  sourceLine: number;
  blockIndex: number;
}

function decodeCssEscape(value: string): string {
  return value.replace(/\\([0-9a-fA-F]{1,6})\s?|(\\(.))/g, (_match, hex, _space, other, char) => {
    if (hex !== undefined) {
      const cp = Number.parseInt(hex, 16);
      if (cp > 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
      return '';
    }
    return char;
  });
}

function sanitizeStyle(value: string): string {
  const normalized = decodeCssEscape(value);
  return normalized
    .replace(/javascript\s*:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(');
}

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
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
    ],
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
    },
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

export interface PreviewResult {
  html: string;
  sourceMap: SourceMapEntry[];
}

export async function generatePreview(
  wikitext?: string | null,
  api_url?: string | null,
  page?: string | null
): Promise<PreviewResult> {
  const Parser = (await import('wikiparser-node')).default;
  const root = Parser.parse(wikitext || '', page || 'API');
  const sourceMap = generateSourceMap(root);

  if (api_url) {
    try {
      const formData = new URLSearchParams();
      formData.append('action', 'parse');
      formData.append('text', wikitext || '');
      formData.append('prop', 'text');
      formData.append('contentmodel', 'wikitext');
      formData.append('format', 'json');
      if (page) {
        formData.append('title', page);
      }

      const res = await serverFetch(api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const data = (await res.json()) as {
        parse?: { text?: { '*': string } };
        error?: { info: string };
      };

      if (data.parse?.text?.['*']) {
        return { html: sanitize(data.parse.text['*']), sourceMap };
      }
    } catch (err) {
      if (err instanceof SsrfError) {
        console.error(`SSRF blocked: ${err.url}`);
      } else {
        console.error('MediaWiki preview request failed:', err);
      }
    }
  }

  const html = Parser.toHtml(wikitext || '', false, undefined, page || undefined);
  return { html: sanitize(html), sourceMap };
}
