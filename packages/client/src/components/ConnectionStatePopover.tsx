import { Activity, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ConnectionStatePopoverProps {
  connected: boolean;
  lastConnected: number | null;
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

export function ConnectionStatePopover({ connected, lastConnected }: ConnectionStatePopoverProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  const statusIcon = connected ? (
    <Wifi className="h-3 w-3 text-green-500" />
  ) : (
    <WifiOff className="h-3 w-3 text-red-500" />
  );

  const statusText = connected ? 'Connected' : 'Disconnected';

  const durationText = connected && lastConnected ? formatDuration(now - lastConnected) : null;

  const connectedSinceText = connected && lastConnected ? formatTime(lastConnected) : null;

  return (
    <Tooltip>
      <Popover>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-1 cursor-pointer hover:opacity-80"
              data-testid="connection-state-trigger"
            >
              {statusIcon}
              <span className="hidden sm:inline">{statusText}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Connection details</TooltipContent>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-3 text-sm"
        data-testid="connection-state-popover"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Activity className="h-4 w-4" />
            <span>Status</span>
            <span className="ml-auto flex items-center gap-1 text-xs font-normal">
              {statusIcon}
              <span>{statusText}</span>
            </span>
          </div>

          {connected && (
            <>
              <Separator />

              <div className="space-y-1.5 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Connected since</span>
                  <span className="text-foreground">{connectedSinceText}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="text-foreground">{durationText}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
      </Popover>
    </Tooltip>
  );
}
