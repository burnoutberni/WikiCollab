import type * as Y from 'yjs';

/**
 * Replace the entire content of a Y.Text instance within a transaction.
 *
 * @param ytext - The Y.Text instance to update
 * @param content - The new content to set
 */
export function replaceYText(ytext: Y.Text, content: string): void {
  const doc = ytext.doc;
  if (!doc) return;
  doc.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, content);
  });
}
