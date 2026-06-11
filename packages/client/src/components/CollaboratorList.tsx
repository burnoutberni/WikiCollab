import { useState, useRef } from 'react';
import { MousePointer2 } from 'lucide-react';
import { COLORS } from '@/hooks/useYjs';
import type { Presence } from '@/hooks/useYjs';

interface CollaboratorListProps {
  peers: Presence[];
  userName: string;
  userColor: string;
  onUserNameChange: (name: string) => void;
  onUserColorChange: (color: string) => void;
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

export function CollaboratorList({ peers, userName, userColor, onUserNameChange, onUserColorChange }: CollaboratorListProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(userName);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== userName) {
      onUserNameChange(trimmed);
    } else {
      setDraft(userName);
    }
    setEditing(false);
  };

  return (
    <div className="space-y-1">
      {/* Current user */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 relative">
        <button
          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium shrink-0 cursor-pointer ring-1 ring-foreground/10"
          style={{ backgroundColor: userColor }}
          onClick={() => setShowColors(!showColors)}
          title="Pick color"
        >
          {userName.charAt(0)}
        </button>
        {showColors && (
          <div className="absolute top-full left-0 mt-1 p-2 bg-popover border rounded-md shadow-md z-10 grid grid-cols-4 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                className="h-5 w-5 rounded-full cursor-pointer ring-1 ring-foreground/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => {
                  onUserColorChange(c);
                  setShowColors(false);
                }}
              />
            ))}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(userName);
                  setEditing(false);
                }
              }}
              autoFocus
              className="text-xs font-medium bg-transparent border-b border-foreground/30 outline-none w-full"
            />
          ) : (
            <div
              className="text-xs font-medium truncate cursor-pointer hover:underline"
              onClick={() => {
                setDraft(userName);
                setEditing(true);
              }}
            >
              {userName} (you)
            </div>
          )}
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
