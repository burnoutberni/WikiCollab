import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { yCollab } from 'y-codemirror.next';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, defaultHighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { bracketMatching } from '@codemirror/language';
import { StreamLanguage } from '@codemirror/language';
import { foldGutter } from '@codemirror/language';

const wikitextHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold', color: '#0066cc' },
  { tag: tags.heading1, fontSize: '1.4em', fontWeight: 'bold' },
  { tag: tags.heading2, fontSize: '1.2em', fontWeight: 'bold' },
  { tag: tags.heading3, fontSize: '1.1em', fontWeight: 'bold' },
  { tag: tags.link, color: '#0066cc', textDecoration: 'underline' },
  { tag: tags.keyword, color: '#0066cc' },
  { tag: tags.comment, color: '#999', fontStyle: 'italic' },
  { tag: tags.string, color: '#009900' },
  { tag: tags.bracket, color: '#666' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.monospace, fontFamily: 'monospace', backgroundColor: '#f0f0f0' },
]);

const wikitextLanguage = StreamLanguage.define({
  token(stream, _state) {
    if (stream.match("'''")) return 'strong';
    if (stream.match("''")) return 'emphasis';
    if (stream.match('__')) return 'strong';
    if (stream.match('~~')) return 'strikethrough';
    if (stream.match('---')) return 'keyword';
    if (stream.match('===')) return 'keyword';

    if (stream.match(/\[\[/)) return 'bracket';
    if (stream.match(/\]\]/)) return 'bracket';
    if (stream.match(/\[http/)) return 'link';

    if (stream.match(/^={1,6}\s/)) return 'heading';
    if (stream.match(/\s={1,6}$/)) return 'heading';

    if (stream.match(/\{\{/)) return 'bracket';
    if (stream.match(/\}\}/)) return 'bracket';

    if (stream.match(/\{\|/)) return 'bracket';
    if (stream.match(/\|\}/)) return 'bracket';
    if (stream.match(/^\|/)) return 'bracket';
    if (stream.match(/^!/)) return 'bracket';

    if (stream.match(/\[\[/)) return 'link';
    if (stream.match(/\]\]/)) return 'link';

    if (stream.match(/\[/)) return 'link';
    if (stream.match(/\]/)) return 'link';

    if (stream.match(/<!--/)) {
      while (stream.next() != null) {
        if (stream.match('-->')) return 'comment';
      }
      return 'comment';
    }

    if (stream.match(/\{\{.*?\}\}/)) return 'template';

    stream.next();
    return null;
  },
  startState() {
    return {};
  },
});

interface WikitextEditorProps {
  content: string;
  onChange: (value: string) => void;
  ytext?: Y.Text | null;
  ydoc?: Y.Doc | null;
  provider?: WebsocketProvider | null;
  onCursorChange?: (anchor: number, head: number) => void;
}

export function WikitextEditor({ content, onChange: _onChange, ytext, ydoc: _ydoc, provider, onCursorChange }: WikitextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const baseExtensions: any[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      foldGutter(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      wikitextLanguage,
      syntaxHighlighting(wikitextHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
      }),
    ];

    if (ytext && provider) {
      baseExtensions.push(yCollab(ytext, provider.awareness));
    }

    const state = EditorState.create({
      doc: content,
      extensions: baseExtensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    if (onCursorChange) {
      const cursorListener = () => {
        const sel = view.state.selection;
        onCursorChange(sel.main.anchor, sel.main.head);
      };
      view.dom.addEventListener('click', cursorListener);
      view.dom.addEventListener('keyup', cursorListener);

      const origDestroy = view.destroy.bind(view);
      view.destroy = () => {
        view.dom.removeEventListener('click', cursorListener);
        view.dom.removeEventListener('keyup', cursorListener);
        origDestroy();
      };
    }

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [ytext?.doc?.clientID, provider?.awareness]);

  useEffect(() => {
    if (!viewRef.current) return;

    const currentContent = viewRef.current.state.doc.toString();
    if (currentContent !== content) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
    }
  }, [content]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
    />
  );
}
