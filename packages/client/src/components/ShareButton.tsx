import { Check, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ShareButtonProps {
  documentId: string;
  showLabel?: boolean;
  className?: string;
}

export function ShareButton({ documentId, showLabel = false, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `${window.location.origin}/doc/${documentId}`;

  useEffect(
    () => () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    },
    []
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
        } catch (error) {
          if ((error as DOMException).name === 'AbortError') return;
          await copyLink();
        }
      } else {
        await copyLink();
      }
    },
    [copyLink, url]
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant={copied ? 'secondary' : 'ghost'} size="sm" className={className}>
          <a href={`/doc/${documentId}`} onClick={handleClick}>
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {showLabel && <span className="ml-1.5">{copied ? 'Copied!' : 'Share'}</span>}
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Link copied to clipboard' : 'Share document'}</TooltipContent>
    </Tooltip>
  );
}
