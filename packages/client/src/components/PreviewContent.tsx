import { useEffect, useRef } from 'react';

export interface PreviewOverlayMarker {
  id: string;
  userName: string;
  color: string;
  anchor: number;
  head: number;
}

interface PreviewContentProps {
  /** Must already be sanitized by the caller. Assigned directly to innerHTML. */
  html: string;
  css: string;
  className?: string;
  onExternalLink: (url: string) => void;
  markers?: PreviewOverlayMarker[];
  markersStale?: boolean;
}

/** Renders MediaWiki preview HTML in a shadow root so wiki CSS cannot leak into the app. */
export function PreviewContent({
  html,
  css,
  className = '',
  onExternalLink,
  markers = [],
  markersStale = false,
}: PreviewContentProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    if (!shadowRef.current) {
      shadowRef.current = hostRef.current.attachShadow({ mode: 'open' });
    }
  }, []);

  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;

    const style = document.createElement('style');
    style.textContent = `${css}
.wc-marker{display:inline-block;width:0;height:0;overflow:hidden;}
.wc-preview-shell{position:relative;}
.wc-preview-overlay{position:absolute;inset:0;pointer-events:none;z-index:2147483647;}
.wc-preview-caret{position:absolute;width:2px;min-height:1em;}
.wc-preview-selection{position:absolute;border-radius:2px;}
.wc-preview-label{position:absolute;border-radius:3px;padding:1px 5px;color:white;font:11px/1.4 system-ui,sans-serif;white-space:nowrap;transform:translateY(-100%);}
.wc-preview-overlay-stale{opacity:.45;}`;
    const shell = document.createElement('div');
    shell.className = 'wc-preview-shell';
    const content = document.createElement('div');
    content.className = 'mw-preview-container';
    content.innerHTML = html;
    const overlay = document.createElement('div');
    overlay.className = `wc-preview-overlay${markersStale ? ' wc-preview-overlay-stale' : ''}`;
    overlay.setAttribute('data-testid', 'preview-cursor-overlay');
    shell.append(content, overlay);
    shadow.replaceChildren(style, shell);
  }, [css, html, markersStale]);

  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;
    const content = shadow.querySelector('.mw-preview-container');
    const overlay = shadow.querySelector('.wc-preview-overlay');
    if (!(content instanceof HTMLElement) || !(overlay instanceof HTMLElement)) return;
    overlay.replaceChildren();
    overlay.classList.toggle('wc-preview-overlay-stale', markersStale);

    const markerElements = new Map<string, HTMLElement>();
    for (const marker of content.querySelectorAll('.wc-marker[id]')) {
      if (marker instanceof HTMLElement && marker.id) {
        markerElements.set(marker.id, marker);
      }
    }

    const shellRect = overlay.getBoundingClientRect();
    const drawLabel = (marker: PreviewOverlayMarker, x: number, y: number) => {
      const label = document.createElement('div');
      label.className = 'wc-preview-label';
      label.textContent = marker.userName;
      label.style.backgroundColor = marker.color;
      label.style.left = `${x}px`;
      label.style.top = `${Math.max(12, y)}px`;
      overlay.append(label);
    };
    const drawRects = (range: Range, marker: PreviewOverlayMarker, className: string) => {
      try {
        const rects = Array.from(range.getClientRects());
        const fallbackRect = rects[0] || range.getBoundingClientRect();
        for (const rect of rects.length
          ? rects
          : fallbackRect.width || fallbackRect.height
            ? [fallbackRect]
            : []) {
          const el = document.createElement('div');
          el.className = className;
          el.style.backgroundColor = marker.color;
          el.style.opacity = className.includes('selection') ? '0.25' : '0.18';
          el.style.left = `${rect.left - shellRect.left}px`;
          el.style.top = `${rect.top - shellRect.top}px`;
          el.style.width = `${Math.max(1, rect.width)}px`;
          el.style.height = `${Math.max(16, rect.height)}px`;
          overlay.append(el);
        }
        if (fallbackRect.width || fallbackRect.height) {
          drawLabel(marker, fallbackRect.left - shellRect.left, fallbackRect.top - shellRect.top);
          return true;
        }
      } catch {
        // jsdom and other test environments may not implement layout APIs.
      }
      return false;
    };

    for (const marker of markers) {
      const caret = markerElements.get(`${marker.id}:caret`);
      const start = markerElements.get(`${marker.id}:start`);
      const end = markerElements.get(`${marker.id}:end`);
      const templateStart = markerElements.get(`${marker.id}:template-start`);
      const templateEnd = markerElements.get(`${marker.id}:template-end`);
      if (caret) {
        try {
          const rect = caret.getBoundingClientRect();
          const el = document.createElement('div');
          el.className = 'wc-preview-caret';
          el.style.backgroundColor = marker.color;
          el.style.left = `${rect.left - shellRect.left}px`;
          el.style.top = `${rect.top - shellRect.top}px`;
          el.style.height = `${Math.max(16, rect.height)}px`;
          overlay.append(el);
          drawLabel(marker, rect.left - shellRect.left, rect.top - shellRect.top);
        } catch {
          const el = document.createElement('div');
          el.className = 'wc-preview-caret';
          el.style.backgroundColor = marker.color;
          overlay.append(el);
          drawLabel(marker, 0, 0);
        }
      } else if (start && end) {
        const range = document.createRange();
        range.setStartAfter(start);
        range.setEndBefore(end);
        drawRects(range, marker, 'wc-preview-selection');
        range.detach();
      } else if (templateStart && templateEnd) {
        const range = document.createRange();
        range.setStartAfter(templateStart);
        range.setEndBefore(templateEnd);
        drawRects(range, marker, 'wc-preview-selection wc-preview-template-fallback');
        range.detach();
      }
    }
  }, [markers, markersStale, html]);

  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;

    const handleClick = (event: Event) => {
      const target =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      const anchor = target?.closest('a');
      const href = anchor?.getAttribute('href');
      if (!href) return;
      event.preventDefault();
      const normalizedHref = Array.from(href)
        .filter((char) => {
          const code = char.charCodeAt(0);
          return code > 0x20 && (code < 0x7f || code > 0x9f);
        })
        .join('')
        .toLowerCase();
      if (href.startsWith('#')) {
        const id = href.slice(1);
        if (id) {
          shadow.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      const scheme = normalizedHref.match(/^([a-z][a-z0-9+.-]*):/)?.[1];
      if (scheme && !['http', 'https', 'mailto'].includes(scheme)) return;
      onExternalLink(href);
    };

    shadow.addEventListener('click', handleClick);
    return () => shadow.removeEventListener('click', handleClick);
  }, [onExternalLink]);

  return <div ref={hostRef} className={className} data-testid="preview-content" />;
}
