import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { History, RotateCcw, Star, Eye, X } from 'lucide-react';
import { useVersions } from '@/hooks/useApi';

interface VersionHistoryProps {
  documentId: string;
  onRestore: (versionId: string) => void;
  sendCustomMessage?: (type: string, payload: Record<string, string | boolean>) => void;
  onCustomMessage?: (type: string, handler: (data: any) => void) => () => void;
}

export function VersionHistory({ documentId, onRestore, sendCustomMessage, onCustomMessage }: VersionHistoryProps) {
  const { versions, loading, starVersion, unstarVersion, getVersionPreview } = useVersions(
    documentId,
    sendCustomMessage,
    onCustomMessage
  );
  const [open, setOpen] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const handleRestore = useCallback((versionId: string) => {
    onRestore(versionId);
    setOpen(false);
  }, [onRestore]);

  const handleStar = useCallback(async (versionId: string, starred: boolean) => {
    if (starred) {
      await unstarVersion(versionId);
    } else {
      await starVersion(versionId);
    }
  }, [starVersion, unstarVersion]);

  const handlePreview = useCallback(async (versionId: string) => {
    if (previewingVersion === versionId) {
      setPreviewingVersion(null);
      setPreviewContent(null);
      return;
    }

    setPreviewingVersion(versionId);
    setPreviewLoading(true);
    const content = await getVersionPreview(versionId);
    setPreviewContent(content);
    setPreviewLoading(false);
  }, [previewingVersion, getVersionPreview]);

  const isLatestVersion = (index: number) => index === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Browse and restore previous versions of this document.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px]">
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
                      isLatestVersion(index) ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{formatDate(version.created_at)}</p>
                        {isLatestVersion(index) && (
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
                        <Star className={`h-4 w-4 ${version.starred ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(version.id)}
                        title={previewingVersion === version.id ? 'Close preview' : 'Preview version'}
                      >
                        {previewingVersion === version.id ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      {!isLatestVersion(index) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(version.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                  {previewingVersion === version.id && (
                    <div className="mt-2 rounded-md border bg-muted p-3">
                      {previewLoading ? (
                        <div className="text-sm text-muted-foreground">Loading preview...</div>
                      ) : previewContent !== null ? (
                        <pre className="text-sm whitespace-pre-wrap font-mono max-h-[200px] overflow-auto">
                          {previewContent}
                        </pre>
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
