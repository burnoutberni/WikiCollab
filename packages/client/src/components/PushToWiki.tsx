import { Send } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type MediaWikiInstance } from '@/hooks/useApi';

interface PushToWikiProps {
  documentId: string;
  title: string;
  wikiTitle: string;
  onWikiTitleChange: (value: string) => void;
  content: string;
  instance: MediaWikiInstance | null;
}

export function PushToWiki({
  documentId,
  title,
  wikiTitle,
  onWikiTitleChange,
  content,
  instance,
}: PushToWikiProps) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        onWikiTitleChange(title);
        setSummary('');
        setResult(null);
      }
    },
    [title, onWikiTitleChange]
  );

  const handlePush = useCallback(async () => {
    if (!instance || !wikiTitle) return;

    setResult(null);

    try {
      const res = await fetch(`/api/docs/${documentId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wikiTitle,
          content,
          summary: summary || `Updated via WikiCollab`,
          api_url: instance.api_url,
          token: instance.token,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: 'Article pushed successfully!' });
      } else {
        setResult({ success: false, message: data.error || 'Failed to push' });
      }
    } catch (err) {
      console.error('Failed to push to wiki:', err);
      setResult({ success: false, message: 'Network error' });
    }
  }, [instance, wikiTitle, content, summary, documentId]);

  const disabled = !instance;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(true)}
                disabled={disabled}
                className={disabled ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <Send className="h-4 w-4 mr-2" />
                Push to Wiki
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {disabled ? 'Configure a MediaWiki instance first' : 'Push content to wiki'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Push to MediaWiki</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300">
              Push to Wiki is not yet implemented. Authentication with MediaWiki bot passwords needs
              to be built first.
            </div>

            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Target:</span>{' '}
              <span className="font-medium">{instance?.name}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wiki-title">Article Title</Label>
              <Input
                id="wiki-title"
                value={wikiTitle}
                onChange={(e) => onWikiTitleChange(e.target.value)}
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
            <Button onClick={handlePush} disabled={true} title="Not yet implemented">
              Push to Wiki
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
