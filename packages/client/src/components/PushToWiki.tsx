import { Check, Copy, ExternalLink, Send } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PushToWikiProps {
  title: string;
  wikiTitle: string;
  onWikiTitleChange: (value: string) => void;
  content: string;
  instanceName: string | null;
  instanceApiUrl: string | null;
}

function getEditUrl(apiUrl: string, title: string): string | null {
  try {
    const url = new URL(apiUrl);
    const path = url.pathname.replace(/\/w\/api\.php$/, '/w/index.php').replace(/\/api\.php$/, '/index.php');
    url.pathname = path;
    url.search = '';
    url.searchParams.set('title', title);
    url.searchParams.set('action', 'edit');
    return url.toString();
  } catch {
    return null;
  }
}

/** Manual publishing helper: copy wikitext, open the target wiki editor, publish there. */
export function PushToWiki({
  title,
  wikiTitle,
  onWikiTitleChange,
  content,
  instanceName,
  instanceApiUrl,
}: PushToWikiProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const editUrl = useMemo(
    () => (instanceApiUrl && wikiTitle ? getEditUrl(instanceApiUrl, wikiTitle) : null),
    [instanceApiUrl, wikiTitle]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        onWikiTitleChange(title);
        setCopied(false);
      }
    },
    [title, onWikiTitleChange]
  );

  const copyContent = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
  }, [content]);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
              <Send className="h-4 w-4 mr-2" />
              Publish
            </Button>
          </TooltipTrigger>
          <TooltipContent>Publish manually to the configured wiki</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish to MediaWiki</DialogTitle>
            <DialogDescription>
              Publish by copying the wikitext and opening the wiki editor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="wiki-title">Target page title</Label>
              <Input
                id="wiki-title"
                value={wikiTitle}
                onChange={(e) => onWikiTitleChange(e.target.value)}
                placeholder="Article title"
              />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">1. Copy</div>
                  <p className="text-xs text-muted-foreground">Copy the latest wikitext from this pad.</p>
                </div>
                <Button size="sm" onClick={copyContent}>
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">2. Open wiki page in editor mode</div>
                  <p className="text-xs text-muted-foreground">
                    {instanceApiUrl
                      ? `Target: ${instanceName || instanceApiUrl}`
                      : 'Configure a MediaWiki instance for this document first.'}
                  </p>
                </div>
                {editUrl ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={editUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Editor
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Editor
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">3. Paste and go</div>
              <p className="text-xs text-muted-foreground mt-1">
                Paste the copied wikitext into the wiki editor, preview it if desired, then publish manually on the wiki.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
