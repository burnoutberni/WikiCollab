import DOMPurify from 'dompurify';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { Presence } from '@/hooks/useYjs';
import defaultCss from '@/styles/wikipedia.css?inline';
import { getWikiBaseUrlOrFallback } from '@/utils/wikiUrl';

import { LoadingSpinner } from './LoadingSpinner';
import { PreviewContent, type PreviewOverlayMarker } from './PreviewContent';
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
  peers?: Presence[];
}

interface PreviewSnapshot {
  html: string;
  source: string;
  sourceVersion: number;
  markers: PreviewOverlayMarker[];
  stale: boolean;
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
  peers = [],
}: SplitPaneEditorProps) {
  const isMobile = useIsMobile();
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot>({
    html: '',
    source: '',
    sourceVersion: 0,
    markers: [],
    stale: false,
  });
  const pendingPreviewSnapshotRef = useRef<PreviewSnapshot>({
    html: '',
    source: '',
    sourceVersion: 0,
    markers: [],
    stale: false,
  });
  const [loading, setLoading] = useState(false);
  const [linkModalUrl, setLinkModalUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextContentRefreshRef = useRef(true);
  const previewRequestIdRef = useRef(0);
  const activeWsRequestIdRef = useRef<string | null>(null);
  const previewTypingBurstActiveRef = useRef(false);

  const apiUrlRef = useRef(apiUrl);
  const titleRef = useRef(title);

  const previewCss = instanceCss ? `${defaultCss}\n${instanceCss}` : defaultCss;
  const previewHtml = previewSnapshot.html;
  const previewBusy = loading || externalPreviewBusy;
  const previewBusyLabel = previewLoadingLabel || 'Rendering preview...';
  const isInitialSetup = previewBusy && !previewHtml;

  const sanitizePreviewHtml = useCallback(
    (html: string) =>
      DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ALLOW_DATA_ATTR: false,
        ADD_ATTR: ['data-wc-marker'],
      }),
    []
  );

  const buildPreviewMarkers = useCallback(
    (source: string): PreviewOverlayMarker[] =>
      peers
        .filter((peer) => peer.cursor)
        .map((peer) => ({
          id: `peer-${peer.clientId}`,
          userName: peer.userName,
          color: peer.color,
          anchor: Math.max(0, Math.min(source.length, peer.cursor!.anchor)),
          head: Math.max(0, Math.min(source.length, peer.cursor!.head)),
        })),
    [peers]
  );

  const setRenderedPreview = useCallback(
    (html: string, source: string, sourceVersion: number, markers: PreviewOverlayMarker[]) => {
      setPreviewSnapshot({
        html: sanitizePreviewHtml(html),
        source,
        sourceVersion,
        markers,
        stale: false,
      });
    },
    [sanitizePreviewHtml]
  );

  const markPreviewStale = useCallback(() => {
    setPreviewSnapshot((snapshot) => (snapshot.html ? { ...snapshot, stale: true } : snapshot));
  }, []);

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
    (requestId: string, markers: PreviewOverlayMarker[]) => {
      if (sendCustomMessage) {
        sendCustomMessage('preview_request', {
          page: title || '',
          requestId,
          markerRequests: JSON.stringify(markers),
        });
      }
    },
    [sendCustomMessage, title]
  );

  const previewResponseMatchesActiveRequest = useCallback(
    (payload: { requestId?: string; requestIds?: string }) => {
      const activeRequestId = activeWsRequestIdRef.current;
      if (!activeRequestId) return false;
      if (payload.requestId === activeRequestId) return true;
      if (!payload.requestIds) return false;
      try {
        const requestIds = JSON.parse(payload.requestIds) as unknown;
        return Array.isArray(requestIds) && requestIds.includes(activeRequestId);
      } catch {
        return false;
      }
    },
    []
  );

  useEffect(() => {
    if (!onCustomMessage) return;
    const unsubscribe = onCustomMessage(
      'preview_update',
      (payload: { html: string; page: string; requestId?: string; requestIds?: string }) => {
        if (!previewResponseMatchesActiveRequest(payload)) return;
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
          setRenderedPreview(
            html,
            pendingPreviewSnapshotRef.current.source,
            pendingPreviewSnapshotRef.current.sourceVersion,
            pendingPreviewSnapshotRef.current.markers
          );
        }
      }
    );
    return unsubscribe;
  }, [clearWsTimeout, onCustomMessage, previewResponseMatchesActiveRequest, setRenderedPreview]);

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
          setRenderedPreview(
            '<p class="text-red-500">Failed to generate preview</p>',
            pendingPreviewSnapshotRef.current.source,
            pendingPreviewSnapshotRef.current.sourceVersion,
            pendingPreviewSnapshotRef.current.markers
          );
        }
      }
    );
    return unsubscribe;
  }, [clearWsTimeout, onCustomMessage, setRenderedPreview]);

  const fetchPreview = useCallback(async () => {
    const requestId = ++previewRequestIdRef.current;
    const wikitext = ytext ? ytext.toString() : content;
    const markers = buildPreviewMarkers(wikitext);
    pendingPreviewSnapshotRef.current = {
      html: '',
      source: wikitext,
      sourceVersion: requestId,
      markers,
      stale: false,
    };
    if (!wikitext.trim()) {
      if (requestId === previewRequestIdRef.current) {
        setPreviewSnapshot({
          html: '',
          source: wikitext,
          sourceVersion: requestId,
          markers,
          stale: false,
        });
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    markPreviewStale();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HTTP_PREVIEW_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/docs/${documentId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wikitext,
          page: title || null,
          markerRequests: JSON.stringify(markers),
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        let html = data.html || '';
        if (apiUrl) {
          html = rewriteRelativeUrls(html, getWikiBaseUrlOrFallback(apiUrl));
        }
        if (requestId === previewRequestIdRef.current) {
          setRenderedPreview(html, wikitext, requestId, markers);
        }
      } else {
        if (requestId === previewRequestIdRef.current) {
          setRenderedPreview(
            '<p class="text-red-500">Failed to generate preview</p>',
            wikitext,
            requestId,
            markers
          );
        }
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err);
      if (requestId === previewRequestIdRef.current) {
        setRenderedPreview(
          apiUrl
            ? '<p class="text-red-500">Failed to generate preview</p>'
            : '<p class="text-red-500">Preview requires a configured MediaWiki instance</p>',
          wikitext,
          requestId,
          markers
        );
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestId === previewRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    apiUrl,
    buildPreviewMarkers,
    content,
    documentId,
    markPreviewStale,
    setRenderedPreview,
    title,
    ytext,
  ]);

  const refreshPreview = useCallback(() => {
    if (sendCustomMessage && provider?.ws?.readyState === WebSocket.OPEN) {
      const requestId = `preview-${++previewRequestIdRef.current}`;
      const wikitext = ytext ? ytext.toString() : content;
      const markers = buildPreviewMarkers(wikitext);
      pendingPreviewSnapshotRef.current = {
        html: '',
        source: wikitext,
        sourceVersion: previewRequestIdRef.current,
        markers,
        stale: false,
      };
      activeWsRequestIdRef.current = requestId;
      setLoading(true);
      markPreviewStale();
      clearWsTimeout();
      wsTimeoutRef.current = setTimeout(() => {
        wsTimeoutRef.current = null;
        activeWsRequestIdRef.current = null;
        fetchPreview();
      }, WS_PREVIEW_TIMEOUT_MS);
      requestPreview(requestId, markers);
    } else {
      clearWsTimeout();
      activeWsRequestIdRef.current = null;
      fetchPreview();
    }
  }, [
    buildPreviewMarkers,
    clearWsTimeout,
    content,
    sendCustomMessage,
    provider,
    requestPreview,
    fetchPreview,
    markPreviewStale,
    ytext,
  ]);

  const schedulePreview = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!previewTypingBurstActiveRef.current) {
      previewTypingBurstActiveRef.current = true;
      refreshPreview();
    }

    timerRef.current = setTimeout(() => {
      previewTypingBurstActiveRef.current = false;
      refreshPreview();
    }, 500);
  }, [refreshPreview]);

  const schedulePreviewRef = useRef(schedulePreview);
  schedulePreviewRef.current = schedulePreview;
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
    schedulePreviewRef.current();
  }, [content, ytext, isMobile, initialMobileTab]);

  useEffect(() => {
    if (!ytext) return;
    if (isMobile && initialMobileTab !== 'preview') return;
    const observer = () => schedulePreviewRef.current();
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

  const previewSetupOverlay =
    previewBusy && isInitialSetup ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
        <LoadingSpinner
          label={previewBusyLabel}
          className="rounded-md border bg-background/95 px-4 py-3 shadow-sm"
        />
      </div>
    ) : null;

  const previewBusyBadge =
    previewBusy && !isInitialSetup ? (
      <div className="absolute bottom-3 left-3 z-20">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
        >
          <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-foreground" />
          <span>{previewBusyLabel}</span>
        </div>
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
                  className={`mw-preview-container p-4 transition-opacity ${previewBusy && isInitialSetup ? 'opacity-45 pointer-events-none' : ''}`}
                  onExternalLink={handleExternalPreviewLink}
                  markers={previewSnapshot.markers}
                  markersStale={previewSnapshot.stale}
                />
              </div>
              {previewSetupOverlay}
              {previewBusyBadge}
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
                      <RefreshCw className={`h-4 w-4 ${previewBusy ? 'animate-spin' : ''}`} />
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
            className={`mw-preview-container p-4 transition-opacity ${previewBusy && isInitialSetup ? 'opacity-45 pointer-events-none' : ''}`}
            onExternalLink={handleExternalPreviewLink}
            markers={previewSnapshot.markers}
            markersStale={previewSnapshot.stale}
          />
        </div>
        {previewSetupOverlay}
        {previewBusyBadge}
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
                <RefreshCw className={`h-4 w-4 ${previewBusy ? 'animate-spin' : ''}`} />
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
