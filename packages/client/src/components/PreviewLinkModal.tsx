import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Props for confirming external links opened from rendered preview content. */
interface PreviewLinkModalProps {
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Opens preview links in a new tab and closes the dialog after launch. */
export function PreviewLinkModal({ url, open, onOpenChange }: PreviewLinkModalProps) {
  const handleFollow = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Follow Link
          </DialogTitle>
          <DialogDescription>Do you want to open this link in a new tab?</DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-muted px-3 py-2 text-sm break-all font-mono">{url}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleFollow}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
