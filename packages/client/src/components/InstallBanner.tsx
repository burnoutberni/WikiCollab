import { Download, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

export function InstallBanner() {
  const { shouldShowBanner, promptInstall, dismiss } = useInstallPrompt();

  if (!shouldShowBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 safe-area-bottom md:hidden">
      <div className="bg-primary text-primary-foreground rounded-lg p-3 shadow-lg flex items-center gap-3">
        <Download className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Add WikiCollab to Home Screen</p>
          <p className="text-xs opacity-80">Edit offline and get the full app experience</p>
        </div>
        <Button size="sm" variant="secondary" onClick={promptInstall} className="shrink-0 text-xs">
          Install
        </Button>
        <button
          onClick={dismiss}
          className="h-11 w-11 rounded-md hover:bg-primary/80 transition-colors shrink-0 inline-flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
