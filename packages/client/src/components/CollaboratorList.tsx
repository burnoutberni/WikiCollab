import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MousePointer2 } from 'lucide-react';
import { COLORS } from '@/hooks/useYjs';
import type { Presence } from '@/hooks/useYjs';

interface CollaboratorListProps {
  peers: Presence[];
  userName: string;
  userColor: string;
  content: string;
  localCursor: { anchor: number; head: number } | null;
  onUserNameChange: (name: string) => void;
  onUserColorChange: (color: string) => void;
  onJumpToCursor: (anchor: number, head?: number) => void;
  onScrollToCursor: (pos: number) => void;
}

function posToLineCol(content: string, pos: number): { line: number; col: number } {
  const text = content.slice(0, pos);
  const lines = text.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function formatCursor(content: string, cursor: { anchor: number; head: number } | null): string | null {
  if (!cursor) return null;
  if (cursor.anchor === cursor.head) {
    const { line, col } = posToLineCol(content, cursor.anchor);
    return `L${line}:${col}`;
  }
  const from = Math.min(cursor.anchor, cursor.head);
  const to = Math.max(cursor.anchor, cursor.head);
  const a = posToLineCol(content, from);
  const b = posToLineCol(content, to);
  return `L${a.line}:${a.col}–L${b.line}:${b.col}`;
}

const STORAGE_KEY = 'wikicollab-user-custom-colors';

function textColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

function loadCustomColors(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error('Failed to load custom colors from localStorage:', err);
    return [];
  }
}

export function CollaboratorList({ peers, userName, userColor, content, localCursor, onUserNameChange, onUserColorChange, onJumpToCursor, onScrollToCursor }: CollaboratorListProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(userName);
  const [showColors, setShowColors] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [customColors, setCustomColors] = useState<string[]>(loadCustomColors);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== userName) {
      onUserNameChange(trimmed);
    } else {
      setDraft(userName);
    }
    setEditing(false);
  };

  const toggleColors = useCallback(() => {
    if (showColors) {
      setShowColors(false);
      setPickerPos(null);
    } else if (colorTriggerRef.current) {
      const rect = colorTriggerRef.current.getBoundingClientRect();
      const PICKER_W = 144;
      const GAP = 4;
      let left = rect.left;
      let top = rect.bottom + GAP;
      if (left + PICKER_W > window.innerWidth - 8) {
        left = window.innerWidth - 8 - PICKER_W;
      }
      setPickerPos({ top: Math.max(8, top), left: Math.max(8, left) });
      setShowColors(true);
    }
  }, [showColors]);

  useEffect(() => {
    if (!showColors || !pickerRef.current || !pickerPos) return;

    const picker = pickerRef.current;
    const rect = picker.getBoundingClientRect();
    const MARGIN = 8;
    let { top, left } = pickerPos;

    if (rect.bottom > window.innerHeight - MARGIN) {
      top = pickerPos.top - (rect.height + 8);
    }
    if (rect.right > window.innerWidth - MARGIN) {
      left = window.innerWidth - MARGIN - rect.width;
    }

    if (top !== pickerPos.top || left !== pickerPos.left) {
      setPickerPos({ top: Math.max(MARGIN, top), left: Math.max(MARGIN, left) });
    }
  }, [showColors, pickerPos]);

  useEffect(() => {
    if (!showColors) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        colorTriggerRef.current && !colorTriggerRef.current.contains(e.target as Node)
      ) {
        setShowColors(false);
        setPickerPos(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColors]);

  return (
    <div className="space-y-1">
      {/* Current user */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md relative group">
        <button
          ref={colorTriggerRef}
          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 cursor-pointer ring-1 ring-foreground/10"
          style={{ backgroundColor: userColor, color: textColor(userColor) }}
          onClick={(e) => {
            e.stopPropagation();
            toggleColors();
          }}
          title="Pick color"
        >
          {userName.charAt(0)}
        </button>
        {showColors && pickerPos && createPortal(
          <div
            ref={pickerRef}
            className="p-2 bg-popover border rounded-md shadow-md z-50 grid grid-cols-5 gap-1.5"
            style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left }}
          >
            {COLORS.map((c) => (
              <button
                key={c}
                className="h-5 w-5 rounded-full cursor-pointer ring-1 ring-foreground/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => {
                  onUserColorChange(c);
                  setShowColors(false);
                  setPickerPos(null);
                }}
              />
            ))}
            {customColors.map((c) => (
              <button
                key={c}
                className="h-5 w-5 rounded-full cursor-pointer ring-1 ring-foreground/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => {
                  onUserColorChange(c);
                  setShowColors(false);
                  setPickerPos(null);
                }}
              />
            ))}
            <label
              className="h-5 w-5 rounded-full cursor-pointer ring-1 ring-foreground/10 hover:scale-110 transition-transform flex items-center justify-center relative overflow-hidden"
              title="Custom color"
            >
              <input
                type="color"
                value={userColor}
                onChange={(e) => {
                  const newColor = e.target.value;
                  onUserColorChange(newColor);
                  if (!COLORS.includes(newColor)) {
                    setCustomColors(() => {
                      const next = [newColor];
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                      return next;
                    });
                  }
                  setShowColors(false);
                  setPickerPos(null);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="text-[10px] leading-none text-muted-foreground">+</span>
            </label>
          </div>,
          document.body,
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
        {localCursor && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer shrink-0 flex items-center gap-1"
            onClick={() => onJumpToCursor(localCursor.anchor, localCursor.head)}
          >
            <MousePointer2 className="h-2.5 w-2.5" />
            {formatCursor(content, localCursor)}
          </button>
        )}
      </div>

      {/* Remote peers */}
      {peers.map((peer) => (
        <div key={peer.clientId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0"
            style={{ backgroundColor: peer.color, color: textColor(peer.color) }}
          >
            {peer.userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{peer.userName}</div>
          </div>
          {peer.cursor && (
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer shrink-0 flex items-center gap-1"
              onClick={() => onScrollToCursor(peer.cursor!.anchor)}
            >
              <MousePointer2 className="h-2.5 w-2.5" />
              {formatCursor(content, peer.cursor)}
            </button>
          )}
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
