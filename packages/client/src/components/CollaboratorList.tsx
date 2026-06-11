import { Users, MousePointer2 } from 'lucide-react';
import type { Presence } from '@/hooks/useYjs';

interface CollaboratorListProps {
  peers: Presence[];
  userName: string;
  userColor: string;
}

function formatCursor(cursor: { anchor: number; head: number } | null): string | null {
  if (!cursor) return null;
  if (cursor.anchor === cursor.head) {
    return `pos ${cursor.anchor}`;
  }
  const from = Math.min(cursor.anchor, cursor.head);
  const to = Math.max(cursor.anchor, cursor.head);
  return `selection ${from}–${to}`;
}

export function CollaboratorList({ peers, userName, userColor }: CollaboratorListProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Collaborators ({peers.length + 1})
      </h3>

      {/* Current user */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium shrink-0"
          style={{ backgroundColor: userColor }}
        >
          {userName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{userName} (you)</div>
        </div>
      </div>

      {/* Remote peers */}
      {peers.map((peer) => (
        <div key={peer.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium shrink-0"
            style={{ backgroundColor: peer.color }}
          >
            {peer.userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{peer.userName}</div>
            {peer.cursor && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MousePointer2 className="h-2.5 w-2.5" />
                {formatCursor(peer.cursor)}
              </div>
            )}
          </div>
        </div>
      ))}

      {peers.length === 0 && (
        <p className="text-xs text-muted-foreground px-2">
          No other collaborators yet. Share this document to start editing together.
        </p>
      )}
    </div>
  );
}
