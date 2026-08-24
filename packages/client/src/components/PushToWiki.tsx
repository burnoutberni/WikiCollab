import { Check, Copy, ExternalLink, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PushToWikiProps {
  title: string;
  content: string;
  instanceApiUrl: string | null;
}

function getPageUrl(apiUrl: string, title: string): string | null {
  try {
    const url = new URL(apiUrl);
    if (!/\/api\.php$/.test(url.pathname)) return null;
    const pathPrefix = url.pathname
      .replace(/\/w\/api\.php$/, '/wiki/')
      .replace(/\/api\.php$/, '/wiki/');
    url.pathname = `${pathPrefix}${encodeURIComponent(title.replaceAll(' ', '_'))}`;
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

function getEditUrl(apiUrl: string, title: string): string | null {
  try {
    const url = new URL(apiUrl);
    if (!/\/api\.php$/.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/api\.php$/, '/index.php');
    url.search = '';
    url.searchParams.set('title', title);
    url.searchParams.set('action', 'edit');
    return url.toString();
  } catch {
    return null;
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Manual publishing helper: copy wikitext, open the target wiki editor, publish there. */
export function PushToWiki({ title, content, instanceApiUrl }: PushToWikiProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const targetUrl = useMemo(
    () => (instanceApiUrl && title ? getPageUrl(instanceApiUrl, title) : null),
    [instanceApiUrl, title]
  );
  const targetEditUrl = instanceApiUrl && title ? getEditUrl(instanceApiUrl, title) : null;
  const canOpenTarget = targetEditUrl !== null && isValidUrl(targetEditUrl);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setCopied(false);
      setCopyError(false);
    }
  }, []);

  useEffect(() => {
    setCopied(false);
  }, [content]);

  const copyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
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
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">1. Copy</div>
                  <p className="text-xs text-muted-foreground">
                    Copy the latest wikitext from this pad.
                  </p>
                </div>
                <Button size="sm" onClick={copyContent}>
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {copyError && (
                <p className="text-xs text-destructive">
                  Copy failed. Select and copy the wikitext manually.
                </p>
              )}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">2. Edit wiki page</div>
                  {instanceApiUrl && targetUrl ? (
                    <p className="break-all text-xs text-muted-foreground">{targetUrl}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Configure a MediaWiki instance for this document first.
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {canOpenTarget && targetEditUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={targetEditUrl} target="_blank" rel="noopener noreferrer">
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
            </div>

            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">3. Paste and go</div>
              <p className="text-xs text-muted-foreground mt-1">
                Paste the copied wikitext into the wiki editor, preview it if desired, then publish
                manually on the wiki.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
