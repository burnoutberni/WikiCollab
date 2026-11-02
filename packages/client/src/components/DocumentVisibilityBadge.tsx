import { Globe, Link2 } from 'lucide-react';
import type { DocumentVisibility } from 'shared';

import { cn } from '@/lib/utils';

interface DocumentVisibilityBadgeProps {
  visibility: DocumentVisibility;
  className?: string;
}

const VISIBILITY_COPY: Record<DocumentVisibility, { label: string; hint: string }> = {
  public: {
    label: 'Public',
    hint: 'Listed on the start page and in search',
  },
  unlisted: {
    label: 'Link only',
    hint: "Hidden from other users' listings and search; accessible via link",
  },
};

/** Quiet label that makes a document's visibility scannable without competing with its title. */
export function DocumentVisibilityBadge({ visibility, className }: DocumentVisibilityBadgeProps) {
  const isPublic = visibility === 'public';
  const Icon = isPublic ? Globe : Link2;
  const { label, hint } = VISIBILITY_COPY[visibility];

  return (
    <span
      title={hint}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none',
        isPublic
          ? 'border-transparent bg-secondary text-secondary-foreground'
          : 'border-foreground/20 bg-background text-foreground',
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      {label}
    </span>
  );
}
