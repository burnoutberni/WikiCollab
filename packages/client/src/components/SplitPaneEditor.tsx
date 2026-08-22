import DOMPurify from 'dompurify';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/useMediaQuery';
import defaultCss from '@/styles/wikipedia.css?inline';
import { getWikiBaseUrlOrFallback } from '@/utils/wikiUrl';

import { LoadingSpinner } from './LoadingSpinner';
import { PreviewContent } from './PreviewContent';
import { PreviewLinkModal } from './PreviewLinkModal';
import { WikitextEditor, type WikitextEditorHandle } from './WikitextEditor';

const WS_PREVIEW_TIMEOUT_MS = 5000;
const HTTP_PREVIEW_TIMEOUT_MS = 15000;

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
  initialMobileTab?: 'source' | 'preview';
  previewRefreshKey?: number;
  previewBusy?: boolean;
  previewLoadingLabel?: string;
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
  documentId,
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
  initialMobileTab = 'source',
  previewRefreshKey = 0,
  previewBusy: externalPreviewBusy = false,
  previewLoadingLabel,
}: SplitPaneEditorProps) {
  const isMobile = useIsMobile();
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkModalUrl, setLinkModalUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextContentRefreshRef = useRef(true);
  const previewRequestIdRef = useRef(0);
  const activeWsRequestIdRef = useRef<string | null>(null);

  const apiUrlRef = useRef(apiUrl);
  const titleRef = useRef(title);

  const previewCss = instanceCss ? `${defaultCss}\n${instanceCss}` : defaultCss;
  const previewBusy = loading || externalPreviewBusy;
  const previewBusyLabel = previewLoadingLabel || 'Rendering preview...';

  const sanitizePreviewHtml = useCallback(
    (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }),
    []
  );

  const clearWsTimeout = useCallback(() => {
    if (!wsTimeoutRef.current) return;
    clearTimeout(wsTimeoutRef.current);
    wsTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    apiUrlRef.current = apiUrl;
    titleRef.current = title;
  }, [apiUrl, title]);

  const requestPreview = useCallback(
    (requestId: string) => {
      if (sendCustomMessage) {
        sendCustomMessage('preview_request', {
          page: title || '',
          requestId,
        });
      }
    },
    [sendCustomMessage, title]
  );

  useEffect(() => {
    if (!onCustomMessage) return;
    const unsubscribe = onCustomMessage(
      'preview_update',
      (payload: { html: string; page: string; requestId?: string }) => {
        if (!payload.requestId || payload.requestId !== activeWsRequestIdRef.current) return;
        activeWsRequestIdRef.current = null;
        const currentApiUrl = apiUrlRef.current || '';
        const currentTitle = titleRef.current || '';
        clearWsTimeout();
        setLoading(false);
        if (payload.page === currentTitle) {
          let html = payload.html;
          if (currentApiUrl) {
            html = rewriteRelativeUrls(html, getWikiBaseUrlOrFallback(currentApiUrl));
          }
          setPreviewHtml(sanitizePreviewHtml(html));
        }
      }
    );
    return unsubscribe;
  }, [clearWsTimeout, onCustomMessage, sanitizePreviewHtml]);

  useEffect(() => {
    if (!onCustomMessage) return;
    const unsubscribe = onCustomMessage(
      'preview_error',
      (payload: { page: string; requestId?: string }) => {
        if (!payload.requestId || payload.requestId !== activeWsRequestIdRef.current) return;
        activeWsRequestIdRef.current = null;
        const currentTitle = titleRef.current || '';
        clearWsTimeout();
        setLoading(false);
        if (payload.page === currentTitle) {
          setPreviewHtml(
            sanitizePreviewHtml('<p class="text-red-500">Failed to generate preview</p>')
          );
        }
      }
    );
    return unsubscribe;
  }, [clearWsTimeout, onCustomMessage, sanitizePreviewHtml]);

  const fetchPreview = useCallback(async () => {
    const requestId = ++previewRequestIdRef.current;
    const wikitext = ytext ? ytext.toString() : content;
    if (!wikitext.trim()) {
      if (requestId === previewRequestIdRef.current) {
        setPreviewHtml('');
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HTTP_PREVIEW_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/docs/${documentId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext, page: title || null }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        let html = data.html || '';
        if (apiUrl) {
          html = rewriteRelativeUrls(html, getWikiBaseUrlOrFallback(apiUrl));
        }
        if (requestId === previewRequestIdRef.current) {
          setPreviewHtml(sanitizePreviewHtml(html));
        }
      } else {
        if (requestId === previewRequestIdRef.current) {
          setPreviewHtml(
            sanitizePreviewHtml('<p class="text-red-500">Failed to generate preview</p>')
          );
        }
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err);
      if (requestId === previewRequestIdRef.current) {
        setPreviewHtml(
          sanitizePreviewHtml(
            apiUrl
              ? '<p class="text-red-500">Failed to generate preview</p>'
              : '<p class="text-red-500">Preview requires a configured MediaWiki instance</p>'
          )
        );
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestId === previewRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [apiUrl, content, documentId, sanitizePreviewHtml, title, ytext]);

  const refreshPreview = useCallback(() => {
    if (sendCustomMessage && provider?.ws?.readyState === WebSocket.OPEN) {
      const requestId = `preview-${++previewRequestIdRef.current}`;
      activeWsRequestIdRef.current = requestId;
      setLoading(true);
      clearWsTimeout();
      wsTimeoutRef.current = setTimeout(() => {
        wsTimeoutRef.current = null;
        activeWsRequestIdRef.current = null;
        fetchPreview();
      }, WS_PREVIEW_TIMEOUT_MS);
      requestPreview(requestId);
    } else {
      clearWsTimeout();
      activeWsRequestIdRef.current = null;
      fetchPreview();
    }
  }, [clearWsTimeout, sendCustomMessage, provider, requestPreview, fetchPreview]);

  const debouncedPreview = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(refreshPreview, 500);
  }, [refreshPreview]);

  const debouncedPreviewRef = useRef(debouncedPreview);
  debouncedPreviewRef.current = debouncedPreview;
  const refreshPreviewRef = useRef(refreshPreview);
  refreshPreviewRef.current = refreshPreview;

  useEffect(() => {
    if (isMobile && initialMobileTab !== 'preview') return;
    skipNextContentRefreshRef.current = true;
    refreshPreviewRef.current();
  }, [apiUrl, title, documentId, previewRefreshKey, isMobile, initialMobileTab]);

  useEffect(() => {
    if (ytext) return;
    if (isMobile && initialMobileTab !== 'preview') return;
    if (skipNextContentRefreshRef.current) {
      skipNextContentRefreshRef.current = false;
      return;
    }
    debouncedPreviewRef.current();
  }, [content, ytext, isMobile, initialMobileTab]);

  useEffect(() => {
    if (!ytext) return;
    if (isMobile && initialMobileTab !== 'preview') return;
    const observer = () => debouncedPreviewRef.current();
    ytext.observe(observer);
    return () => {
      ytext.unobserve(observer);
    };
  }, [ytext, isMobile, initialMobileTab]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearWsTimeout();
    },
    [clearWsTimeout]
  );

  const handleExternalPreviewLink = useCallback((href: string) => {
    setLinkModalUrl(href);
  }, []);

  const previewLoadingOverlay = previewBusy ? (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
      <LoadingSpinner
        label={previewBusyLabel}
        className="rounded-md border bg-background/95 px-4 py-3 shadow-sm"
      />
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-hidden">
          {initialMobileTab === 'source' && (
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
          )}
          {initialMobileTab === 'preview' && (
            <div className="h-full relative">
              <div className="h-full overflow-auto overscroll-contain">
                <PreviewContent
                  css={previewCss}
                  html={previewHtml}
                  className={`mw-preview-container p-4 transition-opacity ${previewBusy ? 'opacity-45 pointer-events-none' : ''}`}
                  onExternalLink={handleExternalPreviewLink}
                />
              </div>
              {previewLoadingOverlay}
              <div className="absolute bottom-3 right-3 z-20 safe-area-bottom">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={refreshPreview}
                      disabled={previewBusy}
                      aria-label="Refresh preview"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh preview</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
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
          <PreviewContent
            css={previewCss}
            html={previewHtml}
            className={`mw-preview-container p-4 transition-opacity ${previewBusy ? 'opacity-45 pointer-events-none' : ''}`}
            onExternalLink={handleExternalPreviewLink}
          />
        </div>
        {previewLoadingOverlay}
        <div className="absolute bottom-3 right-3 z-20">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshPreview}
                disabled={previewBusy}
                aria-label="Refresh preview"
              >
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
