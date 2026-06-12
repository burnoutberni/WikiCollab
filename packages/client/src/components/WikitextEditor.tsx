import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, RangeSet, Range, EditorSelection } from '@codemirror/state';
import { history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap } from '@codemirror/search';
import { yCollab } from 'y-codemirror.next';
import { registerMediaWiki } from '@bhsd/codemirror-mediawiki';
import { languages } from '@bhsd/codemirror-mediawiki/codemirror';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Heading2,
  Heading3,
  Heading4,
  Link,
  ExternalLink,
  Code2,
  Tag,
  Image,
  FileCode,
  Minus,
  Table,
  Route,
  Quote,
  Ban,
} from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

class LocalCursorWidget extends WidgetType {
  constructor(readonly color: string, readonly name: string) { super(); }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ySelectionCaret';
    span.style.cssText = `background-color: ${this.color}; border-color: ${this.color}`;
    span.textContent = '\u2060';
    const dot = document.createElement('div');
    dot.className = 'cm-ySelectionCaretDot';
    span.appendChild(dot);
    const info = document.createElement('div');
    info.className = 'cm-ySelectionInfo';
    info.textContent = this.name + ' (you)';
    span.appendChild(info);
    return span;
  }
  eq(other: LocalCursorWidget) { return this.color === other.color; }
  compare(other: LocalCursorWidget) { return this.color === other.color; }
}

function localCursorPlugin(userName: string, userColor: string) {
  const colorLight = userColor + '33';
  const cursorDeco = Decoration.widget({
    widget: new LocalCursorWidget(userColor, userName),
    side: 1,
  });
  const selDeco = Decoration.mark({
    class: 'cm-ySelection',
    attributes: { style: `background-color: ${colorLight}` },
  });
  return [
    EditorView.editorAttributes.of({
      class: 'cm-yLocalCursor',
      style: `--cm-y-selection: ${colorLight}`,
    }),
    ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
      buildDecorations(view: EditorView): DecorationSet {
        const decos: Range<Decoration>[] = [];
        const sel = view.state.selection.main;
        if (sel.from !== sel.to) {
          decos.push(selDeco.range(sel.from, sel.to));
        }
        decos.push(cursorDeco.range(sel.to));
        return RangeSet.of(decos);
      }
    }, {
      decorations: v => v.decorations,
    }),
  ];
}

let registered = false;

const defaultMwConfig = {
  tags: {} as Record<string, boolean>,
  tagModes: {} as Record<string, string>,
  doubleUnderscore: [{}] as Record<string, string>[],
  functionHooks: [] as string[],
  variableIDs: [] as string[],
  functionSynonyms: [{}, {}] as Record<string, string>[],
  urlProtocols: 'http://|https://|//',
  nsid: {} as Record<string, number>,
  imageKeywords: {} as Record<string, string>,
  variants: [] as string[],
  redirection: ['#REDIRECT'] as string[],
  permittedHtmlTags: [] as string[],
  implicitlyClosedHtmlTags: [] as string[],
};

interface WikitextEditorProps {
  content: string;
  onChange: (value: string) => void;
  ytext?: Y.Text | null;
  provider?: WebsocketProvider | null;
  onRemoteChange?: (value: string) => void;
  onCursorChange?: (cursor: { anchor: number; head: number } | null) => void;
  userName?: string;
  userColor?: string;
}

export interface WikitextEditorHandle {
  jumpToPosition: (pos: number) => void;
}

export const WikitextEditor = forwardRef<WikitextEditorHandle, WikitextEditorProps>(function WikitextEditor({ content: _content, onChange: _onChange, ytext, provider, onRemoteChange, onCursorChange, userName, userColor }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<EditorView | null>(null);
  const [undoRedo, setUndoRedo] = useState({ canUndo: false, canRedo: false });
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  useImperativeHandle(ref, () => ({
    jumpToPosition(pos: number) {
      if (view) {
        view.dispatch({
          selection: EditorSelection.cursor(pos),
          effects: EditorView.scrollIntoView(pos),
        });
        view.focus();
      }
    },
  }), [view]);

  useEffect(() => {
    if (!containerRef.current || !ytext || !provider) return;

    if (!registered) {
      registerMediaWiki();
      registered = true;
    }

    const getLang = languages.get('mediawiki');
    const langExtension = getLang ? getLang(defaultMwConfig) : [];

    const undoManager = new Y.UndoManager(ytext);
    undoManagerRef.current = undoManager;

    const checkUndoRedo = () => {
      setUndoRedo({ canUndo: undoManager.canUndo(), canRedo: undoManager.canRedo() });
    };

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
        EditorView.lineWrapping,
        langExtension,
        ...(userName && userColor ? [localCursorPlugin(userName, userColor)] : []),
        yCollab(ytext, provider.awareness, { undoManager }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            onRemoteChange?.(newValue);
          }
          if (update.selectionSet) {
            const sel = update.state.selection.main;
            onCursorChange?.({ anchor: sel.anchor, head: sel.head });
          }
          queueMicrotask(checkUndoRedo);
        }),
      ],
    });

    const v = new EditorView({
      state,
      parent: containerRef.current,
    });

    undoManager.on('stack-item-added', checkUndoRedo);
    undoManager.on('stack-item-popped', checkUndoRedo);
    undoManager.on('stack-cleared', checkUndoRedo);
    undoManager.on('stack-item-updated', checkUndoRedo);

    setView(v);
    checkUndoRedo();

    return () => {
      undoManager.off('stack-item-added', checkUndoRedo);
      undoManager.off('stack-item-popped', checkUndoRedo);
      undoManager.off('stack-cleared', checkUndoRedo);
      undoManager.off('stack-item-updated', checkUndoRedo);
      v.destroy();
      setView(null);
    };
  }, [ytext, provider]);

  return (
    <div className="h-full w-full flex flex-col relative">
      <style>{`.cm-yLocalCursor .cm-cursor { display: none !important; }
.cm-yLocalCursor .cm-selectionBackground { background-color: var(--cm-y-selection) !important; }
.cm-yLocalCursor .cm-content ::selection { background-color: var(--cm-y-selection) !important; }
.cm-ySelectionInfo { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important; }
.cm-yLocalCursor:not(.cm-focused) .cm-ySelectionCaret { display: none !important; }
.cm-yLocalCursor:not(.cm-focused) .cm-ySelection { background-color: transparent !important; }`}</style>
      <Toolbar view={view} undoManager={undoManagerRef.current} canUndo={undoRedo.canUndo} canRedo={undoRedo.canRedo} />
      <div
        ref={containerRef}
        className="flex-1 w-full overflow-auto [&_.cm-editor]:h-full [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm"
      />
    </div>
  );
});

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

function Toolbar({ view, undoManager, canUndo, canRedo }: { view: EditorView | null; undoManager: Y.UndoManager | null; canUndo: boolean; canRedo: boolean }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTip = useCallback((text: string, e: React.MouseEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      text,
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const hideTip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTooltip(null), 80);
  }, []);

  const b = (icon: React.ReactNode, tip: string, fn: (v: EditorView) => void, disabled = false) => (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      onClick={() => { if (!disabled && view) fn(view); view?.focus(); }}
      onMouseEnter={(e) => showTip(tip, e)}
      onMouseLeave={hideTip}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer aria-disabled:opacity-30"
    >
      {icon}
    </button>
  );

  const Sep = () => <span className="w-px h-5 bg-border mx-1" />;

  return (
    <>
      <div className="flex items-center gap-px px-2 py-1.5 border-b bg-background">
        {b(<Undo2 className="h-3.5 w-3.5" />, 'Undo', () => undoManager?.undo(), !canUndo)}
        {b(<Redo2 className="h-3.5 w-3.5" />, 'Redo', () => undoManager?.redo(), !canRedo)}
        <Sep />

        {b(<Bold className="h-3.5 w-3.5" />, "Bold — '''text'''", (v) => insertText(v, "'''", "'''", 'bold'))}
        {b(<Italic className="h-3.5 w-3.5" />, "Italic — ''text''", (v) => insertText(v, "''", "''", 'italic'))}
        <Sep />

        {b(<Heading2 className="h-3.5 w-3.5" />, 'Heading 2 — == text ==', (v) => wrapLine(v, '== ', ' =='))}
        {b(<Heading3 className="h-3.5 w-3.5" />, 'Heading 3 — === text ===', (v) => wrapLine(v, '=== ', ' ==='))}
        {b(<Heading4 className="h-3.5 w-3.5" />, 'Heading 4 — ==== text ====', (v) => wrapLine(v, '==== ', ' ===='))}
        <Sep />

        {b(<Link className="h-3.5 w-3.5" />, 'Internal link — [[Page name]]', (v) => insertText(v, '[[', ']]', 'Page name'))}
        {b(<ExternalLink className="h-3.5 w-3.5" />, 'External link — [http:// label]', (v) => insertText(v, '[', ']', 'http://example.com label'))}
        <Sep />

        {b(<FileCode className="h-3.5 w-3.5" />, 'Template — {{name}}', (v) => insertText(v, '{{', '}}', 'template name'))}
        {b(<Tag className="h-3.5 w-3.5" />, 'Category — [[Category:Name]]', (v) => insertText(v, '[[Category:', ']]', 'Category name'))}
        {b(<Image className="h-3.5 w-3.5" />, 'Image — [[File:Name.png|thumb]]', (v) => insertText(v, '[[File:', '|thumb|Caption]]', 'Example.png'))}
        <Sep />

        {b(<Code2 className="h-3.5 w-3.5" />, 'Preformatted — <pre>text</pre>', (v) => insertText(v, '<pre>\n', '\n</pre>', 'preformatted text'))}
        {b(<Ban className="h-3.5 w-3.5" />, 'Nowiki — <nowiki>text</nowiki>', (v) => insertText(v, '<nowiki>', '</nowiki>', 'literal text'))}
        {b(<Minus className="h-3.5 w-3.5" />, 'Horizontal rule — ----', (v) => insertAtLine(v, '----\n'))}
        <Sep />

        {b(<Table className="h-3.5 w-3.5" />, 'Table — {| class="wikitable" ... |}', (v) => insertText(v, '{| class="wikitable"\n|-\n| cell1 || cell2\n|}', ''))}
        <Sep />

        {b(<Route className="h-3.5 w-3.5" />, 'Redirect — #REDIRECT [[Page]]', (v) => insertAtLine(v, '#REDIRECT [['))}
        {b(<Quote className="h-3.5 w-3.5" />, 'Reference — <ref>text</ref>', (v) => insertText(v, '<ref>', '</ref>', 'reference text'))}
      </div>

      {tooltip && (
        <div
          className="fixed z-50 px-2.5 py-1 rounded-md border bg-popover text-popover-foreground text-xs shadow-md pointer-events-none whitespace-nowrap"
          style={{
            top: tooltip.top,
            left: tooltip.left,
            transform: 'translateX(-50%)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  );
}

function insertText(view: EditorView, before: string, after = '', placeholder = '') {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insertion = selected || placeholder;
  view.dispatch({
    changes: { from, to, insert: before + insertion + after },
    selection: { anchor: from + before.length, head: from + before.length + insertion.length },
  });
  view.focus();
}

function insertAtLine(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

function wrapLine(view: EditorView, prefix: string, suffix: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const text = line.text;
  if (text.startsWith(prefix) && text.endsWith(suffix)) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: text.slice(prefix.length, text.length - suffix.length) },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: prefix + text + suffix },
    });
  }
  view.focus();
}
