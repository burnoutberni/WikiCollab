import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Columns,
  FileText,
  Save,
  Settings,
  Share2,
  Users,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocument, useInstances } from '@/hooks/useApi';
import { useEditorLock } from '@/hooks/useEditorLock';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useYjs } from '@/hooks/useYjs';

import { BottomSheet } from './BottomSheet';
import { CollaboratorList } from './CollaboratorList';
import { ConnectionStatePopover } from './ConnectionStatePopover';
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
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('wikicollab-viewMode') as ViewMode) || 'split'
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem('wikicollab-sidebarOpen') === 'true'
  );
  const [collaboratorsExpanded, setCollaboratorsExpanded] = useState(
    () => localStorage.getItem('wikicollab-collaboratorsExpanded') !== 'false'
  );
  const editorRef = useRef<WikitextEditorHandle | null>(null);
  const [localCursor, setLocalCursor] = useState<{ anchor: number; head: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const collaboratorCount = peers.length + 1;
  const websocketServerUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setWikiTitle(doc.title);
      setContentState(doc.content);
    }
  }, [doc]);

  const handleCursorChange = useCallback((cursor: { anchor: number; head: number } | null) => {
    setLocalCursor(cursor);
  }, []);

  const jumpToCursor = useCallback((anchor: number, head?: number) => {
    editorRef.current?.jumpToPosition(anchor, head);
  }, []);

  const scrollToCursor = useCallback((pos: number) => {
    editorRef.current?.scrollToPosition(pos);
  }, []);

  useEffect(() => {
    localStorage.setItem('wikicollab-viewMode', viewMode);
  }, [viewMode]);
  useEffect(() => {
    localStorage.setItem('wikicollab-sidebarOpen', String(sidebarOpen));
  }, [sidebarOpen]);
  useEffect(() => {
    localStorage.setItem('wikicollab-collaboratorsExpanded', String(collaboratorsExpanded));
  }, [collaboratorsExpanded]);

  const handleRemoteChange = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTitle(newTitle);
      if (id) {
        await fetch(`/api/docs/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
      }
    },
    [id]
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
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="flex-1 font-semibold text-sm h-8"
              placeholder="Document title"
            />
            <ConnectionStatePopover
              connected={connected}
              lastConnected={lastConnected}
              documentId={id!}
              collaboratorCount={collaboratorCount}
              websocketServerUrl={websocketServerUrl}
              onReconnect={provider ? () => provider.connect() : undefined}
            />
          </header>
        ) : (
          /* Desktop Header */
          <header className="border-b px-4 py-2 flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to dashboard</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6" />

            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
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
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
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
          {!isMobile && sidebarOpen && (
            <aside className="w-64 border-r flex flex-col">
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
                  className="flex items-center gap-1.5 text-xs font-medium w-full text-left mb-2"
                  onClick={() => setCollaboratorsExpanded(!collaboratorsExpanded)}
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
                  />
                )}
              </div>
            </aside>
          )}

          {/* Editor */}
          <main className="flex-1 overflow-hidden">
            {viewMode === 'source' && (
              <WikitextEditor
                content={content}
                onChange={handleContentChange}
                ytext={ytext}
                provider={provider}
                onRemoteChange={handleRemoteChange}
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
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            sidebarOpen={sidebarOpen}
          />
        )}

        {/* Desktop Status Bar */}
        {!isMobile && (
          <footer className="border-t px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Save className="h-3 w-3" />
                Saved
              </span>
              <ConnectionStatePopover
                connected={connected}
                lastConnected={lastConnected}
                documentId={id!}
                collaboratorCount={collaboratorCount}
                websocketServerUrl={websocketServerUrl}
                onReconnect={provider ? () => provider.connect() : undefined}
              />
            </div>
            <div className="flex items-center gap-4">
              <Tooltip>
                <Popover>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button className="hover:underline cursor-pointer">
                        {collaboratorCount} collaborator{collaboratorCount !== 1 ? 's' : ''}
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>View collaborators</TooltipContent>
                  <PopoverContent side="top" align="end" className="w-64 p-2">
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
                    />
                  </PopoverContent>
                </Popover>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 font-mono hover:underline cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
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
      <BottomSheet open={isMobile && sidebarOpen} onOpenChange={setSidebarOpen} title="Settings">
        <div className="space-y-4">
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
              className="flex items-center gap-1.5 text-xs font-medium w-full text-left mb-2"
              onClick={() => setCollaboratorsExpanded(!collaboratorsExpanded)}
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
              />
            )}
          </div>

          <Separator />

          <div className="space-y-2">
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

            <div className="flex justify-end">
              <button
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                onClick={async () => {
                  const url = window.location.href;
                  if (navigator.share) {
                    try {
                      await navigator.share({ title, url });
                    } catch {
                      // user cancelled
                    }
                  } else {
                    await navigator.clipboard.writeText(url);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }
                }}
              >
                {linkCopied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                {linkCopied ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Takeover Dialog */}
      <Dialog open={!!lockedByOther} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
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
