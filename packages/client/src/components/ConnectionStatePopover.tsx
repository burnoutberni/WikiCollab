import { Activity, Wifi, WifiOff } from 'lucide-react';
import { useMemo } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

interface ConnectionStatePopoverProps {
  connected: boolean;
  wsUrl: string;
  lastConnected: number | null;
  connectionDuration: number | null;
  peerCount: number;
  docId: string;
  onReconnect?: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function ConnectionStatePopover({
  connected,
  wsUrl,
  lastConnected,
  connectionDuration,
  peerCount,
  docId,
}: ConnectionStatePopoverProps) {
  const statusIcon = connected ? (
    <Wifi className="h-3 w-3 text-green-500" />
  ) : (
    <WifiOff className="h-3 w-3 text-red-500" />
  );

  const statusText = connected ? 'Connected' : 'Disconnected';

  const connectedSinceText = useMemo(() => {
    if (connected && lastConnected) {
      return formatTime(lastConnected);
    }
    return null;
  }, [connected, lastConnected]);

  const durationText = useMemo(() => {
    if (connectionDuration !== null) {
      return formatDuration(connectionDuration);
    }
    return null;
  }, [connectionDuration]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 cursor-pointer hover:opacity-80"
          data-testid="connection-state-trigger"
        >
          {statusIcon}
          <span className="hidden sm:inline">{statusText}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-3 text-sm"
        data-testid="connection-state-popover"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Activity className="h-4 w-4" />
            <span>Connection</span>
            <span className="ml-auto flex items-center gap-1 text-xs font-normal">
              {statusIcon}
              <span>{statusText}</span>
            </span>
          </div>

          <Separator />

          <div className="space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Status</span>
              <span className={connected ? 'text-green-500' : 'text-red-500'}>{statusText}</span>
            </div>

            {connected && (
              <>
                <div className="flex justify-between">
                  <span>Connected since</span>
                  <span className="text-foreground">{connectedSinceText}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="text-foreground">{durationText}</span>
                </div>
              </>
            )}

            <div className="flex justify-between">
              <span>Document</span>
              <span
                className="text-foreground font-mono text-xs truncate max-w-[140px]"
                title={docId}
              >
                {docId}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Collaborators</span>
              <span className="text-foreground">{peerCount}</span>
            </div>

            <Separator />

            <div className="flex justify-between">
              <span>Server</span>
              <span
                className="text-foreground font-mono text-xs truncate max-w-[140px]"
                title={wsUrl}
              >
                {wsUrl}
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
