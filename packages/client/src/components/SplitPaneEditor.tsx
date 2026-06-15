import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import defaultCss from '@/styles/wikipedia.css?inline';

import { PreviewLinkModal } from './PreviewLinkModal';
import { WikitextEditor, type WikitextEditorHandle } from './WikitextEditor';

interface SplitPaneEditorProps {
  content: string;
  onChange: (value: string) => void;
  documentId: string;
  title?: string;
  apiUrl?: string | null;
  instanceCss?: string | null;
  ytext?: Y.Text | null;
  provider?: WebsocketProvider | null;
  userName?: string;
  userColor?: string;
  editorRef?: React.RefObject<WikitextEditorHandle | null>;
  onCursorChange?: (cursor: { anchor: number; head: number } | null) => void;
  sendCustomMessage?: (type: string, payload: Record<string, string | boolean>) => void;
  onCustomMessage?: <T>(type: string, handler: (data: T) => void) => () => void;
}

function getWikiBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    return apiUrl.replace(/\/api\.php$/, '');
  }
}

function rewriteRelativeUrls(html: string, baseUrl: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const el of doc.querySelectorAll('a[href], img[src]')) {
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute('href');
      if (
        href &&
        !href.startsWith('http') &&
        !href.startsWith('//') &&
        !href.startsWith('javascript:') &&
        !href.startsWith('#')
      ) {
        el.setAttribute('href', baseUrl + (href.startsWith('/') ? href : '/' + href));
      }
    } else if (el instanceof HTMLImageElement) {
      const src = el.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
        el.setAttribute('src', baseUrl + (src.startsWith('/') ? src : '/' + src));
      }
    }
  }

  return doc.body.innerHTML;
}

export function SplitPaneEditor({
  content,
  onChange,
  apiUrl,
  title,
  instanceCss,
  ytext,
  provider,
  userName,
  userColor,
  editorRef,
  onCursorChange,
  sendCustomMessage,
  onCustomMessage,
}: SplitPaneEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkModalUrl, setLinkModalUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const apiUrlRef = useRef(apiUrl);
  apiUrlRef.current = apiUrl;
  const titleRef = useRef(title);
  titleRef.current = title;

  const previewCss = instanceCss || defaultCss;

  const requestPreview = useCallback(() => {
    if (sendCustomMessage) {
      sendCustomMessage('preview_request', {
        api_url: apiUrl || '',
        page: title || '',
      });
    }
  }, [sendCustomMessage, apiUrl, title]);

  useEffect(() => {
    if (!onCustomMessage) return;
    const unsubscribe = onCustomMessage(
      'preview_update',
      (payload: { html: string; api_url: string; page: string }) => {
        const currentApiUrl = apiUrlRef.current || '';
        const currentTitle = titleRef.current || '';
        if (payload.api_url === currentApiUrl && payload.page === currentTitle) {
          let html = payload.html;
          if (currentApiUrl) {
            html = rewriteRelativeUrls(html, getWikiBaseUrl(currentApiUrl));
          }
          setPreviewHtml(html);
          setLoading(false);
        }
      }
    );
    return unsubscribe;
  }, [onCustomMessage]);

  const fetchPreview = useCallback(async () => {
    const wikitext = ytext ? ytext.toString() : content;
    if (!wikitext.trim()) {
      setPreviewHtml('');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext, api_url: apiUrl || null, page: title || null }),
      });

      if (res.ok) {
        const data = await res.json();
        let html = data.html || '';
        if (apiUrl) {
          html = rewriteRelativeUrls(html, getWikiBaseUrl(apiUrl));
        }
        setPreviewHtml(html);
      } else {
        setPreviewHtml('<p class="text-red-500">Failed to generate preview</p>');
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err);
      setPreviewHtml(
        '<p class="text-red-500">Preview requires a configured MediaWiki instance</p>'
      );
    } finally {
      setLoading(false);
    }
  }, [ytext, apiUrl, title]);

  const refreshPreview = useCallback(() => {
    if (sendCustomMessage && provider?.ws?.readyState === WebSocket.OPEN) {
      setLoading(true);
      requestPreview();
    } else {
      fetchPreview();
    }
  }, [sendCustomMessage, provider, requestPreview, fetchPreview]);

  const debouncedPreview = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(refreshPreview, 500);
  }, [refreshPreview]);

  useEffect(() => {
    refreshPreview();
  }, [apiUrl, title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ytext) return;
    const observer = () => debouncedPreview();
    ytext.observe(observer);
    return () => {
      ytext.unobserve(observer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ytext, debouncedPreview]);

  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && !href.startsWith('javascript:')) {
        e.preventDefault();
        if (href.startsWith('#')) {
          const id = href.slice(1);
          if (id) {
            const el = previewRef.current?.ownerDocument?.getElementById(id);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          setLinkModalUrl(href);
        }
      }
    }
  }, []);

  return (
    <div className="flex h-full">
      <div className="w-1/2 border-r">
        <WikitextEditor
          ref={editorRef}
          content={content}
          onChange={onChange}
          ytext={ytext}
          provider={provider}
          userName={userName}
          userColor={userColor}
          onCursorChange={onCursorChange}
        />
      </div>
      <div className="w-1/2 relative">
        <div className="h-full overflow-auto">
          <style>{previewCss}</style>
          <div
            ref={previewRef}
            className="mw-preview-container p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
            onClick={handlePreviewClick}
          />
        </div>
        <div className="absolute bottom-3 right-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" onClick={refreshPreview} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh preview</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <PreviewLinkModal
        url={linkModalUrl || ''}
        open={linkModalUrl !== null}
        onOpenChange={(open) => {
          if (!open) setLinkModalUrl(null);
        }}
      />
    </div>
  );
}
