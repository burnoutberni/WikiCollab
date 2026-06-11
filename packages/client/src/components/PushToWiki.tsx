import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, FileText } from 'lucide-react';
import { type MediaWikiInstance } from '@/hooks/useApi';

interface PushToWikiProps {
  documentId: string;
  title: string;
  content: string;
  instances: MediaWikiInstance[];
}

export function PushToWiki({ documentId, title, content, instances }: PushToWikiProps) {
  const [open, setOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<MediaWikiInstance | null>(null);
  const [wikiTitle, setWikiTitle] = useState(title);
  const [summary, setSummary] = useState('');
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setWikiTitle(title);
  }, [title]);

  useEffect(() => {
    if (selectedInstance && !instances.find((i) => i.id === selectedInstance.id)) {
      setSelectedInstance(null);
    }
  }, [instances, selectedInstance]);

  const handlePush = useCallback(async () => {
    if (!selectedInstance || !wikiTitle) return;

    setPushing(true);
    setResult(null);

    try {
      const res = await fetch(`/api/docs/${documentId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wikiTitle,
          content,
          summary: summary || `Updated via WikiCollab`,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: 'Article pushed successfully!' });
      } else {
        setResult({ success: false, message: data.error || 'Failed to push' });
      }
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setPushing(false);
    }
  }, [selectedInstance, wikiTitle, content, summary, documentId]);

  const noInstances = instances.length === 0;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={noInstances}
                className={noInstances ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <Send className="h-4 w-4 mr-2" />
                Push to Wiki
              </Button>
            </span>
          </TooltipTrigger>
          {noInstances && (
            <TooltipContent>
              Configure a MediaWiki instance first
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Push to MediaWiki</DialogTitle>
            <DialogDescription>
              Push this article to a configured MediaWiki instance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Instance</Label>
              {instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No MediaWiki instances configured. Add one in settings.
                </p>
              ) : (
                <div className="space-y-1">
                  {instances.map((instance) => (
                    <button
                      key={instance.id}
                      className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                        selectedInstance?.id === instance.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-left'
                      }`}
                      onClick={() => setSelectedInstance(instance)}
                    >
                      <FileText className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{instance.name}</div>
                        <div className="text-xs opacity-70">{instance.api_url}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="wiki-title">Article Title</Label>
              <Input
                id="wiki-title"
                value={wikiTitle}
                onChange={(e) => setWikiTitle(e.target.value)}
                placeholder="Article title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-summary">Edit Summary</Label>
              <Input
                id="edit-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Optional edit summary"
              />
            </div>

            {result && (
              <div
                className={`rounded-md p-3 text-sm ${
                  result.success
                    ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                {result.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePush}
              disabled={!selectedInstance || !wikiTitle || pushing}
            >
              {pushing ? 'Pushing...' : 'Push to Wiki'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
