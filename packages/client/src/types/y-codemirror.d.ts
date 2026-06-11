declare module 'y-codemirror.next' {
  import { Text, UndoManager } from 'yjs';
  import { Extension } from '@codemirror/state';
  import { Awareness } from 'y-protocols/awareness';

  export function yCollab(
    ytext: Text,
    awareness: Awareness,
    options?: {
      undoManager?: UndoManager | false;
    }
  ): Extension;

  export function yRemoteSelections(): Extension;
  export function yRemoteSelectionsTheme(): Extension;
}
