import { ChevronDown, FileText, Link2, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { DocumentVisibility } from 'shared';

import { useIsMobile } from '@/hooks/useMediaQuery';

import { BottomSheet } from './BottomSheet';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const DOCUMENT_TYPES: Array<{
  visibility: DocumentVisibility;
  title: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    visibility: 'public',
    title: 'Public document',
    description: 'Shows up on the start page and in search results.',
    icon: FileText,
  },
  {
    visibility: 'unlisted',
    title: 'Anyone with the link',
    description: 'Hidden from the start page and search, but open to anyone with the link.',
    icon: Link2,
  },
];

interface NewDocumentButtonProps {
  onCreate: (visibility: DocumentVisibility) => Promise<void> | void;
  compact?: boolean;
  fullWidth?: boolean;
  className?: string;
}

function DocumentTypePicker({
  onSelect,
}: {
  onSelect: (visibility: DocumentVisibility) => Promise<void> | void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Choose document type</h3>
        <p className="text-xs text-muted-foreground">
          Pick whether the document should be listed publicly or only be reachable by link.
        </p>
      </div>

      <div className="grid gap-2">
        {DOCUMENT_TYPES.map((type) => {
          const Icon = type.icon;

          return (
            <Button
              key={type.visibility}
              type="button"
              variant="outline"
              className="h-auto w-full justify-start px-3 py-3 text-left"
              onClick={() => onSelect(type.visibility)}
            >
              <div className="mr-3 rounded-md border p-2">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{type.title}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {type.description}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function NewDocumentButton({
  onCreate,
  compact = false,
  fullWidth = false,
  className,
}: NewDocumentButtonProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback(
    async (visibility: DocumentVisibility) => {
      setOpen(false);
      await onCreate(visibility);
    },
    [onCreate]
  );

  const trigger = (
    <Button
      size={compact ? 'sm' : 'default'}
      aria-label="New Document"
      title="New Document"
      className={className}
    >
      <Plus className="h-4 w-4" />
      {!compact && <span className="ml-2">New Document</span>}
      <ChevronDown className="ml-1 h-4 w-4" />
    </Button>
  );

  if (isMobile) {
    return (
      <>
        <Button
          size={compact ? 'sm' : 'default'}
          aria-label="New Document"
          title="New Document"
          className={className}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {!compact && <span className="ml-2">New Document</span>}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
        <BottomSheet open={open} onOpenChange={setOpen} title="New Document">
          <DocumentTypePicker onSelect={handleSelect} />
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={fullWidth ? 'w-[22rem]' : 'w-[20rem]'} align="end" sideOffset={8}>
        <DocumentTypePicker onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}
