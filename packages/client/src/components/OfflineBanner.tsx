import { WifiOff } from 'lucide-react';

import { useConnection } from '../lib/connection-context';

export function OfflineBanner() {
  const { connected } = useConnection();

  if (connected) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 safe-area-top"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="bg-yellow-500 text-yellow-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <WifiOff className="h-4 w-4" />
        <span>You&apos;re offline — changes will sync when reconnected</span>
      </div>
    </div>
  );
}
