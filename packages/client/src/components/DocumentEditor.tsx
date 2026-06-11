import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
} from 'lucide-react';
import { useDocument, useInstances, useTemplates, type MediaWikiInstance } from '@/hooks/useApi';
import { useYjs } from '@/hooks/useYjs';
import { WikitextEditor } from './WikitextEditor';
import { SplitPaneEditor } from './SplitPaneEditor';
import { InstanceManager } from './InstanceManager';
import { PushToWiki } from './PushToWiki';
import { VersionHistory } from './VersionHistory';
import { CollaboratorList } from './CollaboratorList';

type ViewMode = 'source' | 'split';

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { document: doc, loading } = useDocument(id || null);
  const { instances } = useInstances();
  const { templates } = useTemplates(id || null);
  const {
    ytext,
    connected,
    peers,
    userName,
    userColor,
    provider,
    updateCursor,
  } = useYjs(id || null);

  const [title, setTitle] = useState('');
  const [content, setContentState] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('source');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collaboratorsExpanded, setCollaboratorsExpanded] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<MediaWikiInstance | null>(null);

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setContentState(doc.content);
      if (doc.mediawiki_instance_id) {
        const inst = instances.find((i) => i.id === doc.mediawiki_instance_id);
        setSelectedInstance(inst || null);
      }
    }
  }, [doc, instances]);

  const handleTitleChange = useCallback(async (newTitle: string) => {
    setTitle(newTitle);
    if (id) {
      await fetch(`/api/docs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    }
  }, [id]);

  const handleContentChange = useCallback((newContent: string) => {
    setContentState(newContent);
    if (ytext) {
      const currentContent = ytext.toString();
      if (currentContent !== newContent) {
        ytext.doc?.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, newContent);
        });
      }
    }
  }, [ytext]);

  const handleInstanceSelect = useCallback(async (instance: MediaWikiInstance | null) => {
    setSelectedInstance(instance);
    if (id) {
      await fetch(`/api/docs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediawiki_instance_id: instance?.id || null }),
      });
    }
  }, [id]);

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    try {
      const res = await fetch(`/api/docs/${id}/versions/${versionId}/restore`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.yjs_state) {
        const state = Uint8Array.from(atob(data.yjs_state), (c) => c.charCodeAt(0));
        if (ytext?.doc) {
          const Y = await import('yjs');
          Y.applyUpdate(ytext.doc, state);
        }
      }
    } catch (error) {
      console.error('Failed to restore version:', error);
    }
  }, [id, ytext]);

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
          This document may have been deleted or doesn't exist.
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

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

          <VersionHistory documentId={id!} onRestore={handleRestoreVersion} />

          <PushToWiki
            documentId={id!}
            title={title}
            content={content}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          {sidebarOpen && (
            <aside className="w-64 border-r flex flex-col">
              <div className="p-4 border-b">
                <InstanceManager
                  onSelect={handleInstanceSelect}
                  selectedId={selectedInstance?.id}
                />
              </div>

              <div className="p-4 border-b">
                <h3 className="text-sm font-medium mb-2">Templates</h3>
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No templates available. Select a MediaWiki instance to load templates.
                  </p>
                ) : (
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-1">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="text-xs px-2 py-1 rounded hover:bg-muted cursor-pointer"
                        >
                          {template.template_name}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
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
                  <span>{peers.length + 1} collaborator{peers.length !== 1 ? 's' : ''}</span>
                </button>
                {collaboratorsExpanded && (
                  <CollaboratorList
                    peers={peers}
                    userName={userName}
                    userColor={userColor}
                  />
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                  {connected ? (
                    <Wifi className="h-3 w-3 text-green-500" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-red-500" />
                  )}
                  <span>{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
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
                onCursorChange={updateCursor}
              />
            )}
            {viewMode === 'split' && (
              <SplitPaneEditor
                content={content}
                onChange={handleContentChange}
                documentId={id!}
                ytext={ytext}
                provider={provider}
                onCursorChange={updateCursor}
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
            <span>{peers.length + 1} collaborator{peers.length !== 1 ? 's' : ''}</span>
            <span className="font-mono">{id}</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
