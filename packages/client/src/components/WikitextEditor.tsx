import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
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
}

export function WikitextEditor({ content, onChange, ytext, ydoc }: WikitextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const value = update.state.doc.toString();
        onChange(value);
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        foldGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        wikitextLanguage,
        syntaxHighlighting(wikitextHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle),
        updateListener,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (!ytext || !ydoc || !viewRef.current) return;

    const observer = (_event: Y.YTextEvent) => {
      const view = viewRef.current;
      if (!view) return;

      const currentContent = view.state.doc.toString();
      const newContent = ytext.toString();

      if (currentContent !== newContent) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: newContent,
          },
        });
      }
    };

    ytext.observe(observer);

    return () => {
      ytext.unobserve(observer);
    };
  }, [ytext, ydoc]);

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
