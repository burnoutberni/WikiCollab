import { registerMediaWiki } from '@bhsd/codemirror-mediawiki';
import { languages } from '@bhsd/codemirror-mediawiki/codemirror';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import type { Range } from '@codemirror/state';
import { EditorSelection, EditorState, RangeSet } from '@codemirror/state';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  layer,
  lineNumbers,
  rectangularSelection,
  ViewPlugin,
} from '@codemirror/view';
import {
  Ban,
  Bold,
  Code2,
  ExternalLink,
  FileCode,
  Heading2,
  Heading3,
  Heading4,
  Image,
  Italic,
  Link,
  Minus,
  MoreHorizontal,
  Quote,
  Redo2,
  Route,
  Table,
  Tag,
  Undo2,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { yCollab } from 'y-codemirror.next';
import type { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/useMediaQuery';

/** Converts viewport-relative coords from `coordsAtPos` to scrollDOM-relative coords for the layer. */
function getBase(view: EditorView) {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

/** Renders the local user's cursor label as a layer overlay (no widget decoration, so arrow keys work). */
function localCursorPlugin(userName: string, userColor: string) {
  const colorLight = userColor + '33';
  const selDeco = Decoration.mark({
    class: 'cm-ySelection',
    attributes: { style: `background-color: ${colorLight}` },
  });

  let flashUntil = 0;

  const cursorLabel = layer({
    above: true,
    class: 'cm-yLocalCursorLayer',
    markers(view: EditorView) {
      const sel = view.state.selection.main;
      const rect = view.coordsAtPos(sel.head, 1);
      if (!rect) return [];
      const base = getBase(view);
      const x = rect.left - base.left;
      const y = rect.top - base.top;
      const height = rect.bottom - rect.top;
      return [
        {
          eq() {
            return false;
          },
          draw() {
            const container = document.createElement('div');
            container.className = 'cm-yLocalCursorLabel';
            container.style.cssText = `position:absolute;left:${x}px;top:${y}px;height:${height}px`;
            const line = document.createElement('div');
            line.className = 'cm-yLocalCursorLine';
            line.style.cssText = `background-color:${userColor}; border-color:${userColor}`;
            const dot = document.createElement('div');
            dot.className = 'cm-yLocalCursorDot';
            line.appendChild(dot);
            const info = document.createElement('div');
            info.className = 'cm-yLocalCursorInfo';
            info.style.cssText = `background-color:${userColor}`;
            info.textContent = userName + ' (you)';
            line.appendChild(info);
            container.appendChild(line);
            if (Date.now() < flashUntil) {
              line.classList.add('cm-y-flash');
            }
            return container;
          },
        },
      ];
    },
    update(update) {
      return update.selectionSet || update.docChanged;
    },
  });

  function flash(name: string) {
    flashUntil = Date.now() + 1500;
    requestAnimationFrame(() => {
      const localLabel = document.querySelector('.cm-yLocalCursorInfo');
      if (localLabel && localLabel.textContent?.startsWith(name)) {
        const line = localLabel.closest('.cm-yLocalCursorLine');
        if (line && !line.classList.contains('cm-y-flash')) {
          line.classList.add('cm-y-flash');
          setTimeout(() => line.classList.remove('cm-y-flash'), 1500);
        }
      }
    });
  }

  return {
    extensions: [
      EditorView.editorAttributes.of({
        class: 'cm-yLocalCursor',
        style: `--cm-y-selection: ${colorLight}`,
      }),
      ViewPlugin.fromClass(
        class {
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
            return RangeSet.of(decos);
          }
        },
        {
          decorations: (v) => v.decorations,
        }
      ),
      cursorLabel,
    ],
    flash,
  };
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

/** Props for the collaborative CodeMirror editor. */
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
  /** Moves selection to a position and scrolls it into view. */
  jumpToPosition: (anchor: number, head?: number) => void;
  /** Scrolls a position into view without changing selection. */
  scrollToPosition: (pos: number) => void;
  /** Flashes the local cursor label for the given peer name. */
  flashLocalCursor: (name: string) => void;
}

/**
 * Hosts the shared CodeMirror instance and binds it to a Yjs text source when collaboration is enabled.
 */
export const WikitextEditor = forwardRef<WikitextEditorHandle, WikitextEditorProps>(
  function WikitextEditor(
    { ytext, provider, onChange, onRemoteChange, onCursorChange, userName, userColor },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<EditorView | null>(null);
    const [undoRedo, setUndoRedo] = useState({ canUndo: false, canRedo: false });
    const undoManagerRef = useRef<Y.UndoManager | null>(null);
    const flashRef = useRef<((name: string) => void) | null>(null);
    const isMobile = useIsMobile();

    useImperativeHandle(
      ref,
      () => ({
        jumpToPosition(anchor: number, head?: number) {
          if (view) {
            const h = head ?? anchor;
            const sel =
              anchor === h ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, h);
            view.dispatch({
              selection: sel,
              effects: EditorView.scrollIntoView(anchor),
            });
            view.focus();
          }
        },
        scrollToPosition(pos: number) {
          if (view) {
            view.dispatch({
              effects: EditorView.scrollIntoView(pos),
            });
          }
        },
        flashLocalCursor(name: string) {
          flashRef.current?.(name);
        },
      }),
      [view]
    );

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
          ...(userName && userColor ? (() => {
            const plugin = localCursorPlugin(userName, userColor);
            flashRef.current = plugin.flash;
            return plugin.extensions;
          })() : []),
          yCollab(ytext, provider.awareness, { undoManager }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newValue = update.state.doc.toString();
              onChange(newValue);
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

      // Trigger yCollab to sync the initial cursor position to awareness
      // by dispatching a no-op selection update (same position, forces
      // selectionSet so yCollab's update listener fires).
      v.dispatch({ selection: v.state.selection });

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
    }, [ytext, provider, onChange, onRemoteChange, onCursorChange, userName, userColor]);

    return (
      <div className="h-full w-full flex flex-col relative">
        <style>{`.cm-yLocalCursor .cm-cursor { display: none !important; }
.cm-yLocalCursor .cm-selectionBackground { background-color: var(--cm-y-selection) !important; }
.cm-yLocalCursor .cm-content ::selection { background-color: var(--cm-y-selection) !important; }
.cm-yLocalCursor:not(.cm-focused) .cm-ySelection { background-color: transparent !important; }
.cm-yLocalCursorLayer { pointer-events: none; }
.cm-yLocalCursorLabel { position: absolute; pointer-events: auto; }
.cm-yLocalCursorLine { border-left: 1px solid; border-right: 1px solid; margin-left: -1px; margin-right: -1px; box-sizing: border-box; height: 100%; position: relative; cursor: default; }
.cm-yLocalCursorDot { position: absolute; width: .4em; height: .4em; top: -.2em; left: -.2em; border-radius: 50%; background-color: inherit; transition: transform .3s ease-in-out; animation: cm-y-blink 1.2s step-end infinite; }
.cm-yLocalCursorLine:hover > .cm-yLocalCursorDot { transform: scale(0); }
.cm-yLocalCursorInfo { position: absolute; top: -1.05em; left: -1px; font-size: .75em; font-style: normal; font-weight: normal; line-height: normal; user-select: none; color: white; padding-left: 2px; padding-right: 2px; z-index: 101; white-space: nowrap; opacity: 0; transition: opacity .3s ease-in-out; background-color: inherit; }
.cm-yLocalCursorLine:hover > .cm-yLocalCursorInfo { opacity: 1; transition-delay: 0s; }
.cm-yLocalCursor:not(.cm-focused) .cm-yLocalCursorDot { animation: none !important; opacity: 0.5 !important; }
.cm-yLocalCursor:not(.cm-focused) .cm-yLocalCursorLine { opacity: 0.5 !important; }
.cm-yLocalCursor:not(.cm-focused) .cm-yLocalCursorInfo { opacity: 0 !important; }
@keyframes cm-y-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
@keyframes cm-y-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
.cm-ySelectionCaret.cm-y-flash > .cm-ySelectionInfo { opacity: 1 !important; animation: cm-y-flash 1.5s ease-out forwards; }
.cm-yLocalCursorLine.cm-y-flash > .cm-yLocalCursorInfo { opacity: 1 !important; animation: cm-y-flash 1.5s ease-out forwards; }
.cm-ySelectionInfo, .cm-yLocalCursorInfo { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important; }`}</style>
        <Toolbar
          view={view}
          undoManager={undoManagerRef.current}
          canUndo={undoRedo.canUndo}
          canRedo={undoRedo.canRedo}
          isMobile={isMobile}
        />
        <div
          ref={containerRef}
          className="flex-1 w-full overflow-auto [&_.cm-editor]:h-full [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm"
        />
      </div>
    );
  }
);

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

interface ToolbarEntry {
  id: string;
  type: 'button' | 'separator';
  icon?: React.ReactNode;
  tip?: string;
  action?: (v: EditorView) => void;
  disabled?: boolean;
}

function Toolbar({
  view,
  undoManager,
  canUndo,
  canRedo,
  isMobile,
}: {
  view: EditorView | null;
  undoManager: Y.UndoManager | null;
  canUndo: boolean;
  canRedo: boolean;
  isMobile: boolean;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowIds, setOverflowIds] = useState<Set<string>>(new Set());
  const itemWidthsRef = useRef<Map<string, number>>(new Map());
  const [scrollState, setScrollState] = useState({ left: false, right: false });

  const showTip = useCallback(
    (text: string, e: React.MouseEvent) => {
      if (isMobile) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltip({
        text,
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    },
    [isMobile]
  );

  const hideTip = useCallback(() => {
    if (isMobile) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTooltip(null), 80);
  }, [isMobile]);

  const allItems = useMemo<ToolbarEntry[]>(
    () => [
      {
        id: 'undo',
        type: 'button',
        icon: <Undo2 className="h-3.5 w-3.5" />,
        tip: 'Undo',
        action: () => undoManager?.undo(),
        disabled: !canUndo,
      },
      {
        id: 'redo',
        type: 'button',
        icon: <Redo2 className="h-3.5 w-3.5" />,
        tip: 'Redo',
        action: () => undoManager?.redo(),
        disabled: !canRedo,
      },
      { id: 'sep1', type: 'separator' },
      {
        id: 'bold',
        type: 'button',
        icon: <Bold className="h-3.5 w-3.5" />,
        tip: "Bold — '''text'''",
        action: (v) => insertText(v, "'''", "'''", 'bold'),
      },
      {
        id: 'italic',
        type: 'button',
        icon: <Italic className="h-3.5 w-3.5" />,
        tip: "Italic — ''text''",
        action: (v) => insertText(v, "''", "''", 'italic'),
      },
      { id: 'sep2', type: 'separator' },
      {
        id: 'h2',
        type: 'button',
        icon: <Heading2 className="h-3.5 w-3.5" />,
        tip: 'Heading 2 — == text ==',
        action: (v) => wrapLine(v, '== ', ' =='),
      },
      {
        id: 'h3',
        type: 'button',
        icon: <Heading3 className="h-3.5 w-3.5" />,
        tip: 'Heading 3 — === text ===',
        action: (v) => wrapLine(v, '=== ', ' ==='),
      },
      {
        id: 'h4',
        type: 'button',
        icon: <Heading4 className="h-3.5 w-3.5" />,
        tip: 'Heading 4 — ==== text ====',
        action: (v) => wrapLine(v, '==== ', ' ===='),
      },
      { id: 'sep3', type: 'separator' },
      {
        id: 'link',
        type: 'button',
        icon: <Link className="h-3.5 w-3.5" />,
        tip: 'Internal link — [[Page name]]',
        action: (v) => insertText(v, '[[', ']]', 'Page name'),
      },
      {
        id: 'extlink',
        type: 'button',
        icon: <ExternalLink className="h-3.5 w-3.5" />,
        tip: 'External link — [http:// label]',
        action: (v) => insertText(v, '[', ']', 'http://example.com label'),
      },
      { id: 'sep4', type: 'separator' },
      {
        id: 'template',
        type: 'button',
        icon: <FileCode className="h-3.5 w-3.5" />,
        tip: 'Template — {{name}}',
        action: (v) => insertText(v, '{{', '}}', 'template name'),
      },
      {
        id: 'category',
        type: 'button',
        icon: <Tag className="h-3.5 w-3.5" />,
        tip: 'Category — [[Category:Name]]',
        action: (v) => insertText(v, '[[Category:', ']]', 'Category name'),
      },
      {
        id: 'image',
        type: 'button',
        icon: <Image className="h-3.5 w-3.5" />,
        tip: 'Image — [[File:Name.png|thumb]]',
        action: (v) => insertText(v, '[[File:', '|thumb|Caption]]', 'Example.png'),
      },
      { id: 'sep5', type: 'separator' },
      {
        id: 'code',
        type: 'button',
        icon: <Code2 className="h-3.5 w-3.5" />,
        tip: 'Preformatted — <pre>text</pre>',
        action: (v) => insertText(v, '<pre>\n', '\n</pre>', 'preformatted text'),
      },
      {
        id: 'nowiki',
        type: 'button',
        icon: <Ban className="h-3.5 w-3.5" />,
        tip: 'Nowiki — <nowiki>text</nowiki>',
        action: (v) => insertText(v, '<nowiki>', '</nowiki>', 'literal text'),
      },
      {
        id: 'hr',
        type: 'button',
        icon: <Minus className="h-3.5 w-3.5" />,
        tip: 'Horizontal rule — ----',
        action: (v) => insertAtLine(v, '----\n'),
      },
      { id: 'sep6', type: 'separator' },
      {
        id: 'table',
        type: 'button',
        icon: <Table className="h-3.5 w-3.5" />,
        tip: 'Table — {| class="wikitable" ... |}',
        action: (v) => insertText(v, '{| class="wikitable"\n|-\n| cell1 || cell2\n|}', ''),
      },
      { id: 'sep7', type: 'separator' },
      {
        id: 'redirect',
        type: 'button',
        icon: <Route className="h-3.5 w-3.5" />,
        tip: 'Redirect — #REDIRECT [[Page]]',
        action: (v) => insertAtLine(v, '#REDIRECT [['),
      },
      {
        id: 'reference',
        type: 'button',
        icon: <Quote className="h-3.5 w-3.5" />,
        tip: 'Reference — <ref>text</ref>',
        action: (v) => insertText(v, '<ref>', '</ref>', 'reference text'),
      },
    ],
    [canUndo, canRedo, undoManager]
  );

  const overflowItems = useMemo(
    () => (isMobile ? [] : allItems.filter((item) => overflowIds.has(item.id))),
    [allItems, isMobile, overflowIds]
  );

  const displayDropdownItems = useMemo(() => {
    const items = overflowItems;
    if (items.length === 0) return [];
    let start = 0;
    let end = items.length - 1;
    while (start <= end && items[start].type === 'separator') start++;
    while (end >= start && items[end].type === 'separator') end--;
    return start <= end ? items.slice(start, end + 1) : [];
  }, [overflowItems]);

  useLayoutEffect(() => {
    if (isMobile) {
      setOverflowIds(new Set());
      return;
    }

    const container = toolbarRef.current;
    if (!container) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;

      const measuredWidths = allItems
        .map((item) => itemWidthsRef.current.get(item.id) ?? 0)
        .filter((width) => width > 0);
      const totalWidth = measuredWidths.reduce(
        (sum, width, index) => sum + width + (index > 0 ? 1 : 0),
        0
      );

      if (totalWidth <= containerWidth) {
        setOverflowIds(new Set());
        return;
      }

      const moreWidth = 40;

      let usedWidth = 0;
      let itemCount = 0;
      let hasOverflowed = false;
      const overflow = new Set<string>();

      for (const item of allItems) {
        const itemWidth = itemWidthsRef.current.get(item.id) ?? 0;
        if (itemWidth === 0) continue;

        if (hasOverflowed) {
          overflow.add(item.id);
          continue;
        }

        const gap = itemCount > 0 ? 1 : 0;

        if (usedWidth + gap + itemWidth + moreWidth > containerWidth) {
          overflow.add(item.id);
          hasOverflowed = true;
        } else {
          usedWidth += gap + itemWidth;
          itemCount++;
        }
      }

      if (overflow.size > 0) {
        for (let i = allItems.length - 1; i >= 0; i--) {
          const item = allItems[i];
          if (!overflow.has(item.id)) {
            if (item.type === 'separator') overflow.add(item.id);
            break;
          }
        }
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          if (!overflow.has(item.id)) {
            if (item.type === 'separator') overflow.add(item.id);
            else break;
          }
        }
        setOverflowIds(overflow);
      } else {
        setOverflowIds(new Set());
      }
    };

    let measureTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleMeasure = () => {
      if (measureTimeout) clearTimeout(measureTimeout);
      measureTimeout = setTimeout(measure, 150);
    };

    measure();

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (measureTimeout) clearTimeout(measureTimeout);
    };
  }, [isMobile, allItems]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setScrollState({ left, right });
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const el = scrollRef.current;
    if (!el) return;

    handleScroll();

    const observer = new ResizeObserver(handleScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile, handleScroll]);

  const storeWidth = useCallback((el: HTMLElement | null, id: string) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    const ml = parseFloat(cs.marginLeft) || 0;
    const mr = parseFloat(cs.marginRight) || 0;
    itemWidthsRef.current.set(id, el.offsetWidth + ml + mr);
  }, []);

  const renderItem = useCallback(
    (entry: ToolbarEntry) => {
      const isHidden = !isMobile && overflowIds.has(entry.id);

      if (entry.type === 'separator') {
        return (
          <span
            key={entry.id}
            data-item-id={entry.id}
            ref={(el) => {
              if (el && !isHidden) storeWidth(el, entry.id);
            }}
            className={`bg-border shrink-0 ${
              isMobile ? 'w-px h-7 mx-1' : 'w-px h-5 mx-1'
            } ${isHidden ? 'hidden' : ''}`}
          />
        );
      }

      return (
        <button
          key={entry.id}
          type="button"
          data-item-id={entry.id}
          aria-disabled={entry.disabled || undefined}
          aria-label={entry.tip?.split(' — ')[0] || entry.id}
          ref={(el) => {
            if (el && !isHidden) storeWidth(el, entry.id);
          }}
          className={`${isHidden ? 'hidden' : 'inline-flex'} items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer aria-disabled:opacity-30 shrink-0 ${
            isMobile ? 'h-11 w-11 min-w-[44px] min-h-[44px]' : 'h-7 w-7'
          }`}
          onClick={() => {
            if (entry.disabled || !view) return;
            entry.action?.(view);
            view.focus();
          }}
          onMouseEnter={(e) => entry.tip && showTip(entry.tip, e)}
          onMouseLeave={hideTip}
        >
          {entry.icon}
        </button>
      );
    },
    [view, isMobile, overflowIds, showTip, hideTip, storeWidth]
  );

  return (
    <>
      <div
        ref={isMobile ? scrollRef : toolbarRef}
        onScroll={isMobile ? handleScroll : undefined}
        className={`flex items-center gap-px border-b bg-background relative ${
          isMobile
            ? 'overflow-x-auto overscroll-contain px-2 py-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'px-2 py-1.5'
        }`}
      >
        {isMobile && scrollState.left && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
        )}
        {isMobile && scrollState.right && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
        )}
        {allItems.map(renderItem)}
        {!isMobile && overflowItems.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="More formatting options"
                className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer shrink-0 h-7 text-xs font-medium gap-0.5 px-1"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="flex flex-wrap items-center gap-px p-1.5 min-w-0 w-auto"
              align="start"
            >
              {displayDropdownItems.map((entry) =>
                entry.type === 'separator' ? (
                  <span key={entry.id} className="bg-border w-px h-7 mx-1 shrink-0" />
                ) : (
                  <button
                    key={entry.id}
                    type="button"
                    aria-disabled={entry.disabled || undefined}
                    aria-label={entry.tip?.split(' — ')[0] || entry.id}
                    className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer aria-disabled:opacity-30 h-7 w-7 shrink-0"
                    onClick={() => {
                      if (entry.disabled || !view) return;
                      entry.action?.(view);
                      view.focus();
                    }}
                    title={entry.tip}
                  >
                    {entry.icon}
                  </button>
                )
              )}
            </PopoverContent>
          </Popover>
        )}
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
      changes: {
        from: line.from,
        to: line.to,
        insert: text.slice(prefix.length, text.length - suffix.length),
      },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: prefix + text + suffix },
    });
  }
  view.focus();
}
