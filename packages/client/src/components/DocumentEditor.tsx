import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  FileText,
  Code,
  Columns,
  Settings,
  Users,
  Wifi,
  WifiOff,
  Save,
  ChevronDown,
  ChevronRight,
  Share2,
  Check,
} from 'lucide-react';
import { useDocument, useInstances } from '@/hooks/useApi';
import { useYjs } from '@/hooks/useYjs';
import { useEditorLock } from '@/hooks/useEditorLock';
import { WikitextEditor, type WikitextEditorHandle } from './WikitextEditor';
import { SplitPaneEditor } from './SplitPaneEditor';
import { InstanceManager } from './InstanceManager';
import { PushToWiki } from './PushToWiki';
import { VersionHistory } from './VersionHistory';
import { CollaboratorList } from './CollaboratorList';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

type ViewMode = 'source' | 'split';

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
  } = useYjs(id || null);

  const [title, setTitle] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [content, setContentState] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('wikicollab-viewMode') as ViewMode) || 'split'
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem('wikicollab-sidebarOpen') !== 'false'
  );
  const [collaboratorsExpanded, setCollaboratorsExpanded] = useState(
    () => localStorage.getItem('wikicollab-collaboratorsExpanded') !== 'false'
  );
  const editorRef = useRef<WikitextEditorHandle | null>(null);
  const [localCursor, setLocalCursor] = useState<{ anchor: number; head: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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
        {/* Header */}
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
                >
                  <Columns className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Split View</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6" />

          <VersionHistory
            documentId={id!}
            onRestore={handleRestoreVersion}
            sendCustomMessage={sendCustomMessage}
            onCustomMessage={onCustomMessage}
          />

          <PushToWiki
            documentId={id!}
            title={title}
            wikiTitle={wikiTitle}
            onWikiTitleChange={setWikiTitle}
            content={content}
            instance={instances[0] || null}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle settings</TooltipContent>
          </Tooltip>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          {sidebarOpen && (
            <aside className="w-64 border-r flex flex-col">
              <div className="p-4 border-b">
                <InstanceManager
                  instances={instances}
                  loading={instancesLoading}
                  createInstance={createInstance}
                  deleteInstance={deleteInstance}
                />
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
                    {peers.length + 1} collaborator{peers.length + 1 !== 1 ? 's' : ''}
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
              />
            )}
          </main>
        </div>

        {/* Status Bar */}
        <footer className="border-t px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Save className="h-3 w-3" />
              Saved
            </span>
            <span className="flex items-center gap-1">
              {connected ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-red-500" />
              )}
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Tooltip>
              <Popover>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button className="hover:underline cursor-pointer">
                      {peers.length + 1} collaborator{peers.length + 1 !== 1 ? 's' : ''}
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
      </div>

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
