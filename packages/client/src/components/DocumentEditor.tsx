import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Columns,
  FileText,
  Settings,
  Share2,
  Users,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DocumentVisibility } from 'shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocument, useInstances } from '@/hooks/useApi';
import { useEditorLock } from '@/hooks/useEditorLock';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { usePersistField } from '@/hooks/usePersistField';
import { useYjs } from '@/hooks/useYjs';

import { BottomSheet } from './BottomSheet';
import { CollaboratorList } from './CollaboratorList';
import { ConnectionStatePopover } from './ConnectionStatePopover';
import { DocumentVisibilityControl } from './DocumentVisibilityControl';
import { LoadingSpinner } from './LoadingSpinner';
import { MobileEditorBar } from './MobileEditorBar';
import { SplitPaneEditor } from './SplitPaneEditor';
import { WikitextEditor, type WikitextEditorHandle } from './WikitextEditor';

const InstanceManager = lazy(() =>
  import('./InstanceManager').then((mod) => ({ default: mod.InstanceManager }))
);
const PushToWiki = lazy(() => import('./PushToWiki').then((mod) => ({ default: mod.PushToWiki })));
const VersionHistory = lazy(() =>
  import('./VersionHistory').then((mod) => ({ default: mod.VersionHistory }))
);

export type ViewMode = 'source' | 'split';

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { document: doc, loading } = useDocument(id || null);
  const { instances, loading: instancesLoading, createInstance, deleteInstance } = useInstances();
  const { lockedByOther, takeOver } = useEditorLock(id || null);
  const {
    ytext,
    connected,
    peers,
    userName,
    userColor,
    setUserName,
    setUserColor,
    provider,
    setContent,
    sendCustomMessage,
    onCustomMessage,
    lastConnected,
  } = useYjs(id || null);

  const isMobile = useIsMobile();
  const [title, setTitle] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [content, setContentState] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('wikicollab-viewMode');
    return stored === 'source' || stored === 'split' ? stored : 'split';
  });
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('wikicollab-sidebarOpen');
    if (stored !== null) return stored === 'true';
    return !isMobile;
  });
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [collaboratorsExpanded, setCollaboratorsExpanded] = useState(
    () => localStorage.getItem('wikicollab-collaboratorsExpanded') !== 'false'
  );
  const editorRef = useRef<WikitextEditorHandle | null>(null);
  const [localCursor, setLocalCursor] = useState<{ anchor: number; head: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopiedTimeoutRef = useRef<number | null>(null);
  const lastPersistedTitleRef = useRef<string | null>(null);
  const lastPersistedVisibilityRef = useRef<DocumentVisibility | null>(null);
  const collaboratorCount = peers.length + 1;
  const [visibility, setVisibility] = useState<DocumentVisibility>('public');

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setWikiTitle(doc.title);
      setContentState(doc.content);
      setVisibility(doc.visibility);
      lastPersistedTitleRef.current = doc.title;
      lastPersistedVisibilityRef.current = doc.visibility;
      if (isMobile && !doc.content) {
        setViewMode('source');
      }
    }
  }, [doc, isMobile]);

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current !== null) {
        window.clearTimeout(linkCopiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCursorChange = useCallback((cursor: { anchor: number; head: number } | null) => {
    setLocalCursor(cursor);
  }, []);

  const copyCurrentUrl = useCallback(async (url = window.location.href) => {
    try {
      await navigator.clipboard.writeText(url);
      if (linkCopiedTimeoutRef.current !== null) {
        window.clearTimeout(linkCopiedTimeoutRef.current);
      }
      setLinkCopied(true);
      linkCopiedTimeoutRef.current = window.setTimeout(() => {
        setLinkCopied(false);
        linkCopiedTimeoutRef.current = null;
      }, 2000);
      return true;
    } catch {
      setLinkCopied(false);
      return false;
    }
  }, []);

  const pendingCursorRef = useRef<
    { type: 'jump'; anchor: number; head?: number } | { type: 'scroll'; anchor: number } | null
  >(null);

  const flashPeerCursor = useCallback((peerName: string) => {
    requestAnimationFrame(() => {
      // Flash remote cursor labels
      const labels = document.querySelectorAll('.cm-ySelectionInfo');
      for (const label of labels) {
        if (label.textContent === peerName) {
          const caret = label.closest('.cm-ySelectionCaret');
          if (caret && !caret.classList.contains('cm-y-flash')) {
            caret.classList.add('cm-y-flash');
            setTimeout(() => caret.classList.remove('cm-y-flash'), 1500);
          }
          break;
        }
      }
      // Flash local cursor label
      editorRef.current?.flashLocalCursor(peerName);
    });
  }, []);

  const handleLocalCursorClicked = useCallback(() => {
    setMobileSheetOpen(false);
  }, []);

  const handlePeerCursorClicked = useCallback(() => {
    setMobileSheetOpen(false);
  }, []);

  const jumpToCursor = useCallback(
    (anchor: number, head?: number) => {
      if (isMobile && viewMode !== 'source') {
        pendingCursorRef.current = { type: 'jump', anchor, head };
        setViewMode('source');
      } else {
        editorRef.current?.jumpToPosition(anchor, head);
      }
    },
    [isMobile, viewMode]
  );

  const scrollToCursor = useCallback(
    (pos: number) => {
      if (isMobile && viewMode !== 'source') {
        pendingCursorRef.current = { type: 'scroll', anchor: pos };
        setViewMode('source');
      } else {
        editorRef.current?.scrollToPosition(pos);
      }
    },
    [isMobile, viewMode]
  );

  useEffect(() => {
    if (viewMode === 'source' && pendingCursorRef.current) {
      const pendingCursor = pendingCursorRef.current;
      pendingCursorRef.current = null;
      if (pendingCursor.type === 'scroll') {
        editorRef.current?.scrollToPosition(pendingCursor.anchor);
      } else {
        editorRef.current?.jumpToPosition(pendingCursor.anchor, pendingCursor.head);
      }
    }
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('wikicollab-viewMode', viewMode);
  }, [viewMode]);
  useEffect(() => {
    if (!isMobile) {
      const stored = localStorage.getItem('wikicollab-sidebarOpen');
      setDesktopSidebarOpen(stored !== null ? stored === 'true' : true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) localStorage.setItem('wikicollab-sidebarOpen', String(desktopSidebarOpen));
  }, [desktopSidebarOpen, isMobile]);
  useEffect(() => {
    localStorage.setItem('wikicollab-collaboratorsExpanded', String(collaboratorsExpanded));
  }, [collaboratorsExpanded]);

  const handleRemoteChange = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const TITLE_MAX = 500;
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle.slice(0, TITLE_MAX));
  }, []);

  const revertTitle = useCallback((v: string) => setTitle(v), []);
  const revertVisibility = useCallback((v: DocumentVisibility) => setVisibility(v), []);

  usePersistField(id || null, loading, title, lastPersistedTitleRef, 'title', revertTitle);
  usePersistField(
    id || null,
    loading,
    visibility,
    lastPersistedVisibilityRef,
    'visibility',
    revertVisibility
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContentState(newContent);
      if (ytext) {
        const currentContent = ytext.toString();
        if (currentContent !== newContent) {
          setContent(newContent);
        }
      }
    },
    [ytext, setContent]
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      try {
        const res = await fetch(`/api/docs/${id}/versions/${versionId}/restore`, {
          method: 'POST',
        });
        const data = await res.json();
        if (data.content !== undefined && ytext) {
          setContent(data.content);
        }
        if (sendCustomMessage) {
          sendCustomMessage('restore', { versionId, documentId: id! });
        }
      } catch (error) {
        console.error('Failed to restore version:', error);
      }
    },
    [id, ytext, setContent, sendCustomMessage]
  );

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading document...</div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Document not found</h2>
        <p className="text-muted-foreground">
          This document may have been deleted or doesn&apos;t exist.
        </p>
        <Button onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col">
        {/* Mobile Header */}
        {isMobile ? (
          <header className="border-b px-3 py-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="h-11 w-11 shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              maxLength={TITLE_MAX}
              className="h-11 flex-1 font-semibold text-sm"
              placeholder="Document title"
            />
            <ConnectionStatePopover
              connected={connected}
              lastConnected={lastConnected}
              collaboratorCount={collaboratorCount}
              onReconnect={provider ? () => provider.connect() : undefined}
              peers={peers}
              userName={userName}
              userColor={userColor}
              content={content}
              localCursor={localCursor}
              onUserNameChange={setUserName}
              onUserColorChange={setUserColor}
              onJumpToCursor={jumpToCursor}
              onScrollToCursor={scrollToCursor}
              onLocalCursorClicked={handleLocalCursorClicked}
              onPeerCursorClicked={handlePeerCursorClicked}
              onFlashPeerCursor={flashPeerCursor}
            />
          </header>
        ) : (
          /* Desktop Header */
          <header className="border-b px-4 py-2 flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/')}
                  aria-label="Back to dashboard"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to dashboard</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6" />

            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              maxLength={TITLE_MAX}
              className="max-w-xs font-semibold"
              placeholder="Document title"
            />

            <div className="flex-1" />

            {/* View Mode Toggles */}
            <div className="flex items-center border rounded-md">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'source' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('source')}
                    className="rounded-r-none"
                    data-testid="view-source"
                    aria-label="Show source editor"
                    aria-pressed={viewMode === 'source'}
                  >
                    <Code className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Source</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('split')}
                    className="rounded-none"
                    data-testid="view-split"
                    aria-label="Show split view"
                    aria-pressed={viewMode === 'split'}
                  >
                    <Columns className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Split View</TooltipContent>
              </Tooltip>
            </div>

            <Separator orientation="vertical" className="h-6" />

            <Suspense fallback={<LoadingSpinner label="Loading history..." className="py-0" />}>
              <VersionHistory
                documentId={id!}
                onRestore={handleRestoreVersion}
                sendCustomMessage={sendCustomMessage}
                onCustomMessage={onCustomMessage}
              />
            </Suspense>

            <Suspense
              fallback={<LoadingSpinner label="Loading publish tools..." className="py-0" />}
            >
              <PushToWiki
                documentId={id!}
                title={title}
                wikiTitle={wikiTitle}
                onWikiTitleChange={setWikiTitle}
                content={content}
                instance={instances[0] || null}
              />
            </Suspense>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
                  aria-label="Toggle settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle settings</TooltipContent>
            </Tooltip>
          </header>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Desktop Sidebar */}
          {!isMobile && desktopSidebarOpen && (
            <aside className="w-64 border-r flex flex-col">
              <div className="p-4 border-b">
                <DocumentVisibilityControl visibility={visibility} onChange={setVisibility} />
              </div>

              <div className="p-4 border-b">
                <Suspense fallback={<LoadingSpinner label="Loading instance settings..." />}>
                  <InstanceManager
                    instances={instances}
                    loading={instancesLoading}
                    createInstance={createInstance}
                    deleteInstance={deleteInstance}
                  />
                </Suspense>
              </div>

              <div className="p-4 mt-auto border-t">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-medium w-full text-left"
                  onClick={() => setCollaboratorsExpanded(!collaboratorsExpanded)}
                  aria-expanded={collaboratorsExpanded}
                >
                  {collaboratorsExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {collaboratorCount} collaborator{collaboratorCount !== 1 ? 's' : ''}
                  </span>
                </button>
                {collaboratorsExpanded && (
                  <CollaboratorList
                    peers={peers}
                    userName={userName}
                    userColor={userColor}
                    content={content}
                    localCursor={localCursor}
                    onUserNameChange={setUserName}
                    onUserColorChange={setUserColor}
                    onJumpToCursor={jumpToCursor}
                    onScrollToCursor={scrollToCursor}
                    onLocalCursorClicked={handleLocalCursorClicked}
                    onPeerCursorClicked={handlePeerCursorClicked}
                    onFlashPeerCursor={flashPeerCursor}
                  />
                )}
              </div>
            </aside>
          )}

          {/* Editor */}
          <main className="flex-1 overflow-hidden">
            {viewMode === 'source' && (
              <WikitextEditor
                ref={editorRef}
                content={content}
                onChange={handleContentChange}
                ytext={ytext}
                provider={provider}
                onRemoteChange={handleRemoteChange}
                onCursorChange={handleCursorChange}
                userName={userName}
                userColor={userColor}
              />
            )}
            {viewMode === 'split' && (
              <SplitPaneEditor
                content={content}
                onChange={handleContentChange}
                documentId={id!}
                title={wikiTitle}
                apiUrl={instances[0]?.api_url}
                instanceCss={instances[0]?.css}
                ytext={ytext}
                provider={provider}
                userName={userName}
                userColor={userColor}
                editorRef={editorRef}
                onCursorChange={handleCursorChange}
                sendCustomMessage={sendCustomMessage}
                onCustomMessage={onCustomMessage}
                initialMobileTab={isMobile ? 'preview' : 'source'}
              />
            )}
          </main>
        </div>

        {/* Mobile Bottom Action Bar */}
        {isMobile && (
          <MobileEditorBar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onToggleSidebar={() => setMobileSheetOpen(!mobileSheetOpen)}
            sidebarOpen={mobileSheetOpen}
          />
        )}

        {/* Desktop Status Bar */}
        {!isMobile && (
          <footer className="border-t px-4 py-0 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <ConnectionStatePopover
                connected={connected}
                lastConnected={lastConnected}
                collaboratorCount={collaboratorCount}
                onReconnect={provider ? () => provider.connect() : undefined}
                peers={peers}
                userName={userName}
                userColor={userColor}
                content={content}
                localCursor={localCursor}
                onUserNameChange={setUserName}
                onUserColorChange={setUserColor}
                onJumpToCursor={jumpToCursor}
                onScrollToCursor={scrollToCursor}
                onLocalCursorClicked={handleLocalCursorClicked}
                onPeerCursorClicked={handlePeerCursorClicked}
                onFlashPeerCursor={flashPeerCursor}
              />
            </div>
            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 font-mono hover:underline cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      await copyCurrentUrl();
                    }}
                  >
                    {linkCopied ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
                    {linkCopied ? 'Copied!' : id}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {linkCopied ? 'Link copied!' : 'Copy link to clipboard'}
                </TooltipContent>
              </Tooltip>
            </div>
          </footer>
        )}
      </div>

      {/* Mobile Sidebar as Bottom Sheet */}
      <BottomSheet
        open={isMobile && mobileSheetOpen}
        onOpenChange={setMobileSheetOpen}
        title="Settings"
      >
        <div className="space-y-4">
          <DocumentVisibilityControl visibility={visibility} onChange={setVisibility} />

          <Separator />

          <Suspense fallback={<LoadingSpinner label="Loading instance settings..." />}>
            <InstanceManager
              instances={instances}
              loading={instancesLoading}
              createInstance={createInstance}
              deleteInstance={deleteInstance}
            />
          </Suspense>

          <Separator />

          <div>
            <button
              type="button"
              className="flex min-h-[44px] w-full items-center gap-1.5 py-2 text-left text-xs font-medium"
              onClick={() => setCollaboratorsExpanded(!collaboratorsExpanded)}
              aria-expanded={collaboratorsExpanded}
            >
              {collaboratorsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Users className="h-3.5 w-3.5" />
              <span>
                {collaboratorCount} collaborator{collaboratorCount !== 1 ? 's' : ''}
              </span>
            </button>
            {collaboratorsExpanded && (
              <CollaboratorList
                peers={peers}
                userName={userName}
                userColor={userColor}
                content={content}
                localCursor={localCursor}
                onUserNameChange={setUserName}
                onUserColorChange={setUserColor}
                onJumpToCursor={jumpToCursor}
                onScrollToCursor={scrollToCursor}
                onLocalCursorClicked={handleLocalCursorClicked}
                onPeerCursorClicked={handlePeerCursorClicked}
                onFlashPeerCursor={flashPeerCursor}
              />
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between pb-4">
            <Suspense fallback={<LoadingSpinner label="Loading history..." className="py-0" />}>
              <VersionHistory
                documentId={id!}
                onRestore={handleRestoreVersion}
                sendCustomMessage={sendCustomMessage}
                onCustomMessage={onCustomMessage}
              />
            </Suspense>

            <Suspense
              fallback={<LoadingSpinner label="Loading publish tools..." className="py-0" />}
            >
              <PushToWiki
                documentId={id!}
                title={title}
                wikiTitle={wikiTitle}
                onWikiTitleChange={setWikiTitle}
                content={content}
                instance={instances[0] || null}
              />
            </Suspense>

            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const url = window.location.href;
                if (navigator.share) {
                  try {
                    await navigator.share({ title, url });
                  } catch (error) {
                    if (!(error instanceof DOMException && error.name === 'AbortError')) {
                      await copyCurrentUrl(url);
                    }
                  }
                } else {
                  await copyCurrentUrl(url);
                }
              }}
              aria-label={linkCopied ? 'Link copied' : 'Share document'}
            >
              {linkCopied ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <Share2 className="h-4 w-4 mr-2" />
              )}
              {linkCopied ? 'Copied!' : 'Share'}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Takeover Dialog */}
      <Dialog open={!!lockedByOther} onOpenChange={() => {}}>
        <DialogContent
          className="md:max-w-md"
          hideCloseButton
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Session already open</DialogTitle>
            <DialogDescription>
              This document is already open in another tab. Taking over will close the other
              session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/')}>
              Go Back
            </Button>
            <Button onClick={takeOver}>Take Over</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
