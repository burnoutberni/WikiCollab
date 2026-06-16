import type * as Y from 'yjs';

/** Replaces the full Y.Text value in one transaction so collaborators receive a single update. */
export function replaceYText(ytext: Y.Text, content: string): void {
  const doc = ytext.doc;
  if (!doc) throw new Error('Cannot replace Y.Text content: Y.Text is not attached to a document');
  doc.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, content);
  });
}
