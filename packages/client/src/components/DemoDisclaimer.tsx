import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'wikicollab-demo-accepted';

function hasAccepted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function DemoDisclaimer() {
  const [open, setOpen] = useState(() => !hasAccepted());

  const handleAccept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // localStorage unavailable — still close the dialog
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => v && setOpen(true)}>
      <DialogContent
        className="md:max-w-md"
        hideCloseButton
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Demo Instance</DialogTitle>
          <DialogDescription>
            Welcome to WikiCollab. This is a free demo instance — please keep the following in mind:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Data may disappear.</strong> Documents and revisions
            can be deleted at any time without notice. Do not rely on this instance for important
            work.
          </p>
          <p>
            <strong className="text-foreground">Keep it legal.</strong> Do not upload or share
            content that violates applicable laws.
          </p>
          <p>
            <strong className="text-foreground">No warranty.</strong> The software is provided as is
            — see the{' '}
            <a
              href="https://github.com/burnoutberni/WikiCollab"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground inline-flex items-center gap-1"
            >
              project on GitHub
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            for source code and license details.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={handleAccept} className="w-full md:w-auto">
            I understand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
