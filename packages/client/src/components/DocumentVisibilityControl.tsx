import type { DocumentVisibility } from 'shared';

import { Button } from '@/components/ui/button';

const VISIBILITY_OPTIONS: Array<{
  value: DocumentVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'public',
    label: 'Public',
    description: 'Shows up on the start page and in search results.',
  },
  {
    value: 'unlisted',
    label: 'Anyone with the link',
    description: 'Hidden from the start page and search, but anyone with the link can open it.',
  },
];

interface DocumentVisibilityControlProps {
  visibility: DocumentVisibility;
  onChange: (visibility: DocumentVisibility) => void;
  disabled?: boolean;
}

export function DocumentVisibilityControl({
  visibility,
  onChange,
  disabled = false,
}: DocumentVisibilityControlProps) {
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

      <div className="grid gap-2">
        {VISIBILITY_OPTIONS.map((option) => {
          const selected = visibility === option.value;

          return (
            <Button
              key={option.value}
              type="button"
              variant={selected ? 'secondary' : 'outline'}
              className="h-auto w-full justify-start px-3 py-3 text-left"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              aria-pressed={selected}
            >
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {option.description}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
