import { Check, Eye, FileCode, Settings, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ViewMode } from '@/components/DocumentEditor';
import { Button } from '@/components/ui/button';

interface MobileEditorBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function MobileEditorBar({
  viewMode,
  onViewModeChange,
  onToggleSidebar,
  sidebarOpen,
}: MobileEditorBarProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = document.title;
    const copyToClipboard = async () => {
      await navigator.clipboard.writeText(url);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      setCopied(true);
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 2000);
    };

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        try {
          await copyToClipboard();
        } catch {
          setCopied(false);
        }
      }
    } else {
      try {
        await copyToClipboard();
      } catch {
        setCopied(false);
      }
    }
  }, []);

  return (
    <div className="md:hidden border-t bg-background safe-area-bottom">
      <div className="flex items-center gap-1 py-1.5 px-1.5 min-[360px]:gap-2 min-[360px]:px-2">
        <Button
          variant={sidebarOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleSidebar}
          className="flex h-auto min-h-[44px] w-12 flex-col items-center gap-0.5 px-2 py-1.5 min-[360px]:w-[4.5rem] min-[360px]:px-3"
          data-testid="mobile-toggle-settings"
          aria-label="Toggle settings panel"
          aria-haspopup="dialog"
          aria-expanded={sidebarOpen}
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px] max-[359px]:sr-only">Settings</span>
        </Button>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex min-w-0 items-center rounded-md border">
            <Button
              variant={viewMode === 'source' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('source')}
              className="h-11 min-h-[44px] rounded-r-none px-3 min-[360px]:px-4"
              data-testid="mobile-view-source"
              aria-pressed={viewMode === 'source'}
            >
              <FileCode className="mr-0 h-4 w-4 min-[360px]:mr-1.5" />
              <span className="text-xs max-[359px]:sr-only">Source</span>
            </Button>
            <Button
              variant={viewMode !== 'source' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('split')}
              className="h-11 min-h-[44px] rounded-l-none px-3 min-[360px]:px-4"
              data-testid="mobile-view-preview"
              aria-pressed={viewMode !== 'source'}
            >
              <Eye className="mr-0 h-4 w-4 min-[360px]:mr-1.5" />
              <span className="text-xs max-[359px]:sr-only">Preview</span>
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleShare}
          className="flex h-auto min-h-[44px] w-12 flex-col items-center gap-0.5 px-2 py-1.5 min-[360px]:w-[4.5rem] min-[360px]:px-3"
          data-testid="mobile-share"
          aria-label={copied ? 'Link copied' : 'Share document'}
        >
          {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
          <span className="text-[10px] max-[359px]:sr-only">{copied ? 'Copied!' : 'Share'}</span>
        </Button>
      </div>
    </div>
  );
}
