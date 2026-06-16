import { Check, Share2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ShareButtonProps {
  documentId: string;
  showLabel?: boolean;
  className?: string;
}

export function ShareButton({ documentId, showLabel = false, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/doc/${documentId}`;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
        } catch {
          // user cancelled
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }
    },
    [url]
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
