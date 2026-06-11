import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface WikitextEditorProps {
  content: string;
  onChange: (value: string) => void;
  ytext?: Y.Text | null;
  provider?: WebsocketProvider | null;
  onCursorChange?: (anchor: number, head: number) => void;
  onRemoteChange?: (value: string) => void;
}

export function WikitextEditor({ content, onChange: _onChange, ytext, provider: _provider, onCursorChange, onRemoteChange }: WikitextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updatingRef = useRef(false);

  const handleSelectionChange = useCallback(() => {
    if (!onCursorChange || !textareaRef.current) return;
    const el = textareaRef.current;
    onCursorChange(el.selectionStart, el.selectionEnd);
  }, [onCursorChange]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener('select', handleSelectionChange);
    textarea.addEventListener('click', handleSelectionChange);
    textarea.addEventListener('keyup', handleSelectionChange);

    return () => {
      textarea.removeEventListener('select', handleSelectionChange);
      textarea.removeEventListener('click', handleSelectionChange);
      textarea.removeEventListener('keyup', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  useEffect(() => {
    if (!ytext || !textareaRef.current) return;

    const textarea = textareaRef.current;

    const observer = (event: Y.YTextEvent) => {
      if (updatingRef.current) return;

      const text = ytext.toString();
      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;

      textarea.value = text;
      onRemoteChange?.(text);

      const delta = (event.delta as any[]).reduce((acc, d) => {
        if (d.retain) return acc - d.retain;
        if (d.delete) return acc + d.delete;
        return acc + (d.insert?.length || 0);
      }, 0);

      const newLen = text.length;
      const newCursorPos = Math.min(
        textarea.selectionStart + delta,
        newLen
      );
      textarea.setSelectionRange(newCursorPos, newCursorPos);

      textarea.scrollTop = scrollTop;
      textarea.scrollLeft = scrollLeft;
    };

    ytext.observe(observer);
    textarea.value = ytext.toString();

    return () => {
      ytext.unobserve(observer);
    };
  }, [ytext, onRemoteChange]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !ytext) return;

    const handleInput = () => {
      updatingRef.current = true;
      const newText = textarea.value;
      const currentText = ytext.toString();

      if (newText !== currentText) {
        ytext.doc?.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, newText);
        });
      }
      updatingRef.current = false;
    };

    textarea.addEventListener('input', handleInput);
    return () => textarea.removeEventListener('input', handleInput);
  }, [ytext]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const currentContent = textarea.value;
    if (currentContent !== content && !ytext) {
      textarea.value = content;
    }
  }, [content, ytext]);

  return (
    <div className="h-full w-full flex flex-col">
      <textarea
        ref={textareaRef}
        className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-background text-foreground border rounded-md"
        spellCheck={false}
        defaultValue={content}
      />
    </div>
  );
}
