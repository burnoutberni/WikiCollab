import { EditorView } from '@codemirror/view';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { WikitextEditor } from './WikitextEditor';

vi.mock('@bhsd/codemirror-mediawiki', () => ({ registerMediaWiki: vi.fn() }));
vi.mock('@bhsd/codemirror-mediawiki/codemirror', () => ({ languages: new Map() }));

const imported = '{{Infobox Unternehmen\n| Name = Leonardo S.p.A.\n}}\n\nArticle text.';
const onChange = vi.fn();
let doc: Y.Doc;
let provider: WebsocketProvider;

beforeEach(() => {
  onChange.mockReset();
  doc = new Y.Doc();
  provider = new WebsocketProvider('ws://localhost', 'test-import', doc, {
    connect: false,
    disableBc: true,
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(() => {
  provider.destroy();
  doc.destroy();
});

describe('Imported article editor initialization', () => {
  it('shows saved content read-only before collaboration initializes', () => {
    const { container } = render(
      <WikitextEditor content={imported} onChange={onChange} ytext={null} provider={null} />
    );
    expect(container.querySelector('.cm-content')?.textContent).toContain('Leonardo S.p.A.');
    expect(container.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Loading collaborative editor');
    expect(doc.getText('wikitext').length).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches to the synced CRDT and accepts edits without duplicating imported text', () => {
    const ytext = doc.getText('wikitext');
    const { container, rerender } = render(
      <WikitextEditor content={imported} onChange={onChange} ytext={null} provider={null} />
    );
    act(() => ytext.insert(0, imported));
    rerender(
      <WikitextEditor content={imported} onChange={onChange} ytext={ytext} provider={provider} />
    );
    expect(container.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(ytext.toString()).toBe(imported);
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor')! as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: '\nEdited' } }));
    expect(ytext.toString()).toBe(`${imported}\nEdited`);
    expect(onChange).toHaveBeenLastCalledWith(`${imported}\nEdited`);
  });

  it('respects an authoritative empty shared document instead of restoring stale REST content', () => {
    const { container, rerender } = render(
      <WikitextEditor content={imported} onChange={onChange} ytext={null} provider={null} />
    );
    rerender(
      <WikitextEditor
        content={imported}
        onChange={onChange}
        ytext={doc.getText('wikitext')}
        provider={provider}
      />
    );
    expect(container.querySelector('.cm-content')?.textContent).toBe('');
    expect(doc.getText('wikitext').length).toBe(0);
  });
});
