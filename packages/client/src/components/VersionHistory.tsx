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
import { History, RotateCcw } from 'lucide-react';
import { useVersions } from '@/hooks/useApi';

interface VersionHistoryProps {
  documentId: string;
  onRestore: (versionId: string) => void;
}

export function VersionHistory({ documentId, onRestore }: VersionHistoryProps) {
  const { versions, loading } = useVersions(documentId);
  const [open, setOpen] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const handleRestore = useCallback((versionId: string) => {
    onRestore(versionId);
    setOpen(false);
  }, [onRestore]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Browse and restore previous versions of this document.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px]">
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
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{formatDate(version.created_at)}</p>
                    <p className="text-xs text-muted-foreground">ID: {version.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestore(version.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
