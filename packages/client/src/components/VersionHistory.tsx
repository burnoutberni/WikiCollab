import { Eye, History, RotateCcw, Star, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVersions } from '@/hooks/useApi';

/** Props for browsing saved versions and restoring one into the current document. */
interface VersionHistoryProps {
  documentId: string;
  onRestore: (versionId: string) => void;
  sendCustomMessage?: (type: string, payload: Record<string, string | boolean>) => void;
  onCustomMessage?: <T>(type: string, handler: (data: T) => void) => () => void;
}

/** Renders version previews with a stable line-number gutter for difflike scanning. */
function PreviewContent({ content }: { content: string }) {
  const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
  const gutterWidth = `${String(lines.length).length + 1}ch`;
  return (
    <pre
      className="text-sm font-mono max-h-[200px] overflow-auto min-w-0 whitespace-pre-wrap"
      style={{ overflowWrap: 'anywhere' }}
    >
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span
            className="select-none text-muted-foreground text-right pr-3 border-r border-border shrink-0"
            style={{ minWidth: gutterWidth }}
          >
            {i + 1}
          </span>
          <span className="pl-3 min-w-0">{line}</span>
        </div>
      ))}
    </pre>
  );
}

/**
 * Displays document versions, fetches inline previews, and forwards restore/star actions.
 */
export function VersionHistory({
  documentId,
  onRestore,
  sendCustomMessage,
  onCustomMessage,
}: VersionHistoryProps) {
  const { versions, loading, fetchVersions, starVersion, unstarVersion, getVersionPreview } =
    useVersions(documentId, sendCustomMessage, onCustomMessage);
  const [open, setOpen] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchVersions();
    }
  }, [open, fetchVersions]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const handleRestore = useCallback(
    (versionId: string) => {
      onRestore(versionId);
      setOpen(false);
    },
    [onRestore]
  );

  const handleStar = useCallback(
    async (versionId: string, starred: boolean) => {
      if (starred) {
        await unstarVersion(versionId);
      } else {
        await starVersion(versionId);
      }
    },
    [starVersion, unstarVersion]
  );

  const handlePreview = useCallback(
    async (versionId: string) => {
      if (previewingVersion === versionId) {
        setPreviewingVersion(null);
        setPreviewContent(null);
        previewRequestRef.current = null;
        return;
      }

      setPreviewingVersion(versionId);
      previewRequestRef.current = versionId;
      setPreviewLoading(true);
      const content = await getVersionPreview(versionId);
      if (previewRequestRef.current === versionId) {
        setPreviewContent(content);
        setPreviewLoading(false);
      }
    },
    [previewingVersion, getVersionPreview]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Version history</TooltipContent>
      </Tooltip>
      <DialogContent className="md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Browse and restore previous versions of this document.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] relative">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <History className="h-12 w-12 mb-4 opacity-50" />
              <p>No version history yet</p>
              <p className="text-sm">Versions are saved as you edit</p>
            </div>
          ) : (
            <div className="space-y-2 p-1">
              {versions.map((version, index) => (
                <div key={version.id}>
                  <div
                    className={`flex items-center justify-between rounded-md border p-3 ${
                      index === 0 ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{formatDate(version.created_at)}</p>
                        {index === 0 && (
                          <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                        {version.starred && (
                          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">ID: {version.id}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStar(version.id, version.starred)}
                        title={version.starred ? 'Unstar version' : 'Star version'}
                      >
                        <Star
                          className={`h-4 w-4 ${version.starred ? 'fill-yellow-500 text-yellow-500' : ''}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(version.id)}
                        title={
                          previewingVersion === version.id ? 'Close preview' : 'Preview version'
                        }
                      >
                        {previewingVersion === version.id ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      {index !== 0 && (
                        <Button variant="ghost" size="sm" onClick={() => handleRestore(version.id)}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                  {previewingVersion === version.id && (
                    <div className="mt-2 rounded-md border bg-muted p-3 min-w-0">
                      {previewLoading ? (
                        <div className="text-sm text-muted-foreground">Loading preview...</div>
                      ) : previewContent !== null ? (
                        <PreviewContent content={previewContent} />
                      ) : (
                        <div className="text-sm text-muted-foreground">No content available</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
