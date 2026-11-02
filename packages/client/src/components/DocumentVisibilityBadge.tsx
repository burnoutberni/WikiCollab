import { Globe, Link2 } from 'lucide-react';
import type { DocumentVisibility } from 'shared';

import { cn } from '@/lib/utils';

interface DocumentVisibilityBadgeProps {
  visibility: DocumentVisibility;
  className?: string;
}

/** Compact label that makes a document's public or link-only state scannable. */
export function DocumentVisibilityBadge({ visibility, className }: DocumentVisibilityBadgeProps) {
  const isPublic = visibility === 'public';
  const Icon = isPublic ? Globe : Link2;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        isPublic
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isPublic ? 'Public' : 'Link only'}
    </span>
  );
}
