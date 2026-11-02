import { Globe, Link2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { DocumentVisibility } from 'shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DocumentVisibilityControlProps {
  visibility: DocumentVisibility;
  onChange: (visibility: DocumentVisibility) => void;
}

const VISIBILITY_OPTIONS: DocumentVisibility[] = ['public', 'unlisted'];

export function DocumentVisibilityControl({
  visibility,
  onChange,
}: DocumentVisibilityControlProps) {
  const isPublic = visibility === 'public';
  const [publicConfirmOpen, setPublicConfirmOpen] = useState(false);
  const linkRadioRef = useRef<HTMLButtonElement>(null);
  const publicRadioRef = useRef<HTMLButtonElement>(null);

  const requestChange = useCallback(
    (next: DocumentVisibility) => {
      if (next === 'public' && visibility !== 'public') {
        setPublicConfirmOpen(true);
        return;
      }

      onChange(next);
    },
    [visibility, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const current = VISIBILITY_OPTIONS.indexOf(visibility);
      let next: number | null = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (current + 1) % VISIBILITY_OPTIONS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (current - 1 + VISIBILITY_OPTIONS.length) % VISIBILITY_OPTIONS.length;
      }

      if (next !== null) {
        e.preventDefault();
        requestChange(VISIBILITY_OPTIONS[next]);
      }
    },
    [visibility, requestChange]
  );

  const confirmPublic = useCallback(() => {
    setPublicConfirmOpen(false);
    onChange('public');
  }, [onChange]);

  return (
    <section className="space-y-3" aria-labelledby="document-visibility-heading">
      <div className="space-y-1">
        <h3 id="document-visibility-heading" className="text-sm font-semibold">
          Visibility
        </h3>
        <p className="text-xs text-muted-foreground">
          Changing this updates the visibility state for everyone and immediately affects whether
          the document appears on the start page and in search.
        </p>
      </div>

      <div
        className="relative flex rounded-lg bg-muted p-1"
        role="radiogroup"
        aria-labelledby="document-visibility-heading"
        onKeyDown={handleKeyDown}
      >
        <div
          className="absolute top-1 bottom-1 rounded-md bg-background shadow-sm transition-all duration-200 ease-in-out"
          style={{
            left: isPublic ? '50%' : '4px',
            width: 'calc(50% - 4px)',
          }}
          aria-hidden="true"
        />

        <button
          type="button"
          ref={linkRadioRef}
          role="radio"
          aria-checked={!isPublic}
          tabIndex={isPublic ? -1 : 0}
          className="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200"
          onClick={() => requestChange('unlisted')}
        >
          <Link2 className="h-4 w-4" />
          <span>Link</span>
        </button>

        <button
          type="button"
          ref={publicRadioRef}
          role="radio"
          aria-checked={isPublic}
          tabIndex={isPublic ? 0 : -1}
          className="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200"
          onClick={() => requestChange('public')}
        >
          <Globe className="h-4 w-4" />
          <span>Public</span>
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {!isPublic ? 'Only accessible via direct link' : 'Visible on start page and in search'}
      </p>

      <Dialog open={publicConfirmOpen} onOpenChange={setPublicConfirmOpen}>
        <DialogContent
          className="md:max-w-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (isPublic ? publicRadioRef : linkRadioRef).current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Make this document public?</DialogTitle>
            <DialogDescription>
              Public documents are listed on the start page and in search results, so anyone can
              find and read this content. Switch back to link-only at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="gap-2" onClick={() => setPublicConfirmOpen(false)}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Keep link-only
            </Button>
            <Button className="gap-2" onClick={confirmPublic}>
              <Globe className="h-4 w-4" aria-hidden="true" />
              Make public
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
