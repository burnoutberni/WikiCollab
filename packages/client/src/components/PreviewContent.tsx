import { useEffect, useRef } from 'react';

interface PreviewContentProps {
  /** Must already be sanitized by the caller. Assigned directly to innerHTML. */
  html: string;
  css: string;
  className?: string;
  onExternalLink: (url: string) => void;
}

/** Renders MediaWiki preview HTML in a shadow root so wiki CSS cannot leak into the app. */
export function PreviewContent({ html, css, className = '', onExternalLink }: PreviewContentProps) {
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
    style.textContent = css;
    const content = document.createElement('div');
    content.className = 'mw-preview-container';
    content.innerHTML = html;
    shadow.replaceChildren(style, content);
  }, [css, html]);

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
      if (normalizedHref.startsWith('javascript:')) return;
      if (href.startsWith('#')) {
        const id = href.slice(1);
        if (id) {
          shadow.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        onExternalLink(href);
      }
    };

    shadow.addEventListener('click', handleClick);
    return () => shadow.removeEventListener('click', handleClick);
  }, [onExternalLink]);

  return <div ref={hostRef} className={className} data-testid="preview-content" />;
}
