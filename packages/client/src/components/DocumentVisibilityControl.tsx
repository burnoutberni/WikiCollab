import { Globe, Link2 } from 'lucide-react';
import { useCallback } from 'react';
import type { DocumentVisibility } from 'shared';

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
        onChange(VISIBILITY_OPTIONS[next]);
      }
    },
    [visibility, onChange]
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
          onClick={() => onChange('unlisted')}
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
          onClick={() => onChange('public')}
        >
          <Globe className="h-4 w-4" />
          <span>Public</span>
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {!isPublic ? 'Only accessible via direct link' : 'Visible on start page and in search'}
      </p>
    </section>
  );
}
