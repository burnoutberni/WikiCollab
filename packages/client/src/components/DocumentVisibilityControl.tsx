import { Globe, Link2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DocumentVisibility } from 'shared';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

      <AlertDialog open={publicConfirmOpen} onOpenChange={setPublicConfirmOpen}>
        <AlertDialogContent className="md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Make this document public?</AlertDialogTitle>
            <AlertDialogDescription>
              Public documents are listed on the start page and in search results, so anyone can
              find and read this content. Switch back to link-only at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep link-only</AlertDialogCancel>
            <AlertDialogAction onClick={() => onChange('public')}>Make public</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
