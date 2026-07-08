import { Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Presence } from '@/hooks/useYjs';

import { CollaboratorList } from './CollaboratorList';

interface ConnectionStatePopoverProps {
  connected: boolean;
  lastConnected: number | null;
  collaboratorCount: number;
  onReconnect?: () => void;
  peers: Presence[];
  userName: string;
  userColor: string;
  content: string;
  localCursor: { anchor: number; head: number } | null;
  onUserNameChange: (name: string) => void;
  onUserColorChange: (color: string) => void;
  onJumpToCursor: (anchor: number, head?: number) => void;
  onScrollToCursor: (pos: number) => void;
  onLocalCursorClicked?: () => void;
  onPeerCursorClicked?: () => void;
  onFlashPeerCursor?: (peerName: string) => void;
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
  lastConnected,
  collaboratorCount,
  onReconnect,
  peers,
  userName,
  userColor,
  content,
  localCursor,
  onUserNameChange,
  onUserColorChange,
  onJumpToCursor,
  onScrollToCursor,
  onLocalCursorClicked,
  onPeerCursorClicked,
  onFlashPeerCursor,
}: ConnectionStatePopoverProps) {
  const [now, setNow] = useState(Date.now());
  const [retrying, setRetrying] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    if (connected) {
      setRetrying(false);
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [connected]);

  useEffect(() => {
    if (!retrying) return;
    const timeout = setTimeout(() => setRetrying(false), 8000);
    return () => clearTimeout(timeout);
  }, [retrying]);

  const statusIcon = connected ? (
    <span className="relative">
      <Wifi className="h-3 w-3 text-green-500" />
      <span className="absolute -top-1.5 -right-1.5 bg-muted text-muted-foreground text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center leading-none px-0.5 border border-border">
        {collaboratorCount}
      </span>
    </span>
  ) : (
    <WifiOff className="h-3 w-3 text-red-500" />
  );

  const statusText = connected ? 'Connected' : 'Disconnected';

  const durationText =
    connected && lastConnected ? formatDuration(Math.max(0, now - lastConnected)) : null;

  const connectedSinceText = lastConnected ? formatTime(lastConnected) : null;

  const handleRetry = useCallback(() => {
    setRetrying(true);
    onReconnect?.();
  }, [onReconnect]);

  return (
    <Tooltip
      open={tooltipOpen}
      onOpenChange={(open) => {
        if (popoverOpen) return;
        setTooltipOpen(open);
      }}
    >
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          if (open) setTooltipOpen(false);
        }}
      >
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Connection status: ${statusText}. ${collaboratorCount} collaborator${collaboratorCount === 1 ? '' : 's'}`}
              className="inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-80 h-9 rounded-md px-2 sm:px-0"
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
                <span className="ml-1">{statusText}</span>
              </span>
            </div>

            {!connected && onReconnect && (
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={retrying}
                  onClick={handleRetry}
                  data-testid="connection-retry-btn"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                  {retrying ? 'Reconnecting…' : 'Retry'}
                </Button>
              </div>
            )}

            <Separator />

            <CollaboratorList
              peers={peers}
              userName={userName}
              userColor={userColor}
              content={content}
              localCursor={localCursor}
              onUserNameChange={onUserNameChange}
              onUserColorChange={onUserColorChange}
              onJumpToCursor={onJumpToCursor}
              onScrollToCursor={onScrollToCursor}
              onLocalCursorClicked={() => {
                setPopoverOpen(false);
                onLocalCursorClicked?.();
              }}
              onPeerCursorClicked={() => {
                setPopoverOpen(false);
                onPeerCursorClicked?.();
              }}
              onFlashPeerCursor={onFlashPeerCursor}
            />

            {lastConnected && (
              <>
                <Separator />

                <div className="space-y-1.5 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>{connected ? 'Connected since' : 'Last connected'}</span>
                    <span className="text-foreground">{connectedSinceText}</span>
                  </div>
                  {connected && (
                    <div className="flex justify-between">
                      <span>Duration</span>
                      <span className="text-foreground">{durationText}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </Tooltip>
  );
}
