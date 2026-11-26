import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WikiImportDialog } from './WikiImportDialog';

const results = [
  {
    title: 'Berlin',
    api_url: 'https://en.wikipedia.org/w/api.php',
    site_name: 'Wikipedia',
    language: 'en',
  },
  {
    title: 'Berlin Wall',
    api_url: 'https://en.wikipedia.org/w/api.php',
    site_name: 'Wikipedia',
    language: 'en',
  },
];
const fetchMock = vi.fn();
const onCreate = vi.fn();
const onOpenChange = vi.fn();
const field = () => screen.getByRole('combobox', { name: 'Search articles or paste a URL' });

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (path: string) =>
    path.endsWith('/languages')
      ? Response.json([
          { code: 'en', name: 'English', autonym: 'English' },
          { code: 'de', name: 'German', autonym: 'Deutsch' },
        ])
      : Response.json({ results, partial: false })
  );
  onCreate.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function renderDialog() {
  render(<WikiImportDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
}

describe('WikiImportDialog', () => {
  it('has one text field, automatically searches, and selecting a result creates immediately', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveClass('overflow-hidden', 'md:overflow-hidden');
    expect(screen.getByRole('dialog')).not.toHaveClass('overflow-y-auto', 'md:overflow-y-auto');
    expect(screen.getAllByRole('combobox')).toHaveLength(2); // One article field and the native language picker.
    expect(screen.queryByLabelText('Document title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Visibility')).not.toBeInTheDocument();
    await user.type(field(), 'Berlin');
    await user.click(await screen.findByRole('option', { name: 'Berlin Wall Wikipedia · en' }));
    expect(onCreate).toHaveBeenCalledWith('public', {
      wiki_import: { api_url: results[1].api_url, title: 'Berlin Wall' },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      JSON.parse(fetchMock.mock.calls.find(([path]) => path.endsWith('/search'))![1].body)
    ).toEqual({ query: 'Berlin', language: 'en' });
  });

  it('searches the same query in another language without another input or submit', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(field(), 'Berlin');
    await screen.findByRole('option', { name: 'Berlin Wikipedia · en' });
    await user.selectOptions(screen.getByLabelText('Search language'), 'de');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/wiki/search',
        expect.objectContaining({ body: JSON.stringify({ query: 'Berlin', language: 'de' }) })
      )
    );
    expect(field()).toHaveValue('Berlin');
  });

  it.each([
    'https://en.wikipedia.org/wiki/Berlin',
    'https://en.wikipedia.org/w/index.php?oldid=123',
    'https://other.example/wiki/Page',
  ])('pasting %s waits for Enter before importing', async (url) => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(field());
    await user.paste(url);
    expect(field()).toHaveValue(url);
    expect(onCreate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('public', { wiki_import: { url } });
    expect(fetchMock.mock.calls.every(([path]) => path.endsWith('/languages'))).toBe(true);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('accepts a typed URL on Enter', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(field(), 'https://en.wikipedia.org/wiki/Berlin{Enter}');
    expect(onCreate).toHaveBeenCalledWith('public', {
      wiki_import: { url: 'https://en.wikipedia.org/wiki/Berlin' },
    });
  });

  it('accepts a pasted address without a scheme', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(field());
    await user.paste('en.wikipedia.org/wiki/Berlin');
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Import article' }));
    expect(onCreate).toHaveBeenCalledWith('public', {
      wiki_import: { url: 'https://en.wikipedia.org/wiki/Berlin' },
    });
  });

  it('supports arrow-key selection and Enter without moving focus from the field', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(field(), 'Berlin');
    await screen.findByRole('option', { name: 'Berlin Wikipedia · en' });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(field()).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Berlin Wall Wikipedia · en' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('public', {
      wiki_import: { api_url: results[1].api_url, title: 'Berlin Wall' },
    });
  });

  it('debounces input instead of requesting every keystroke', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByLabelText('Search language').children).toHaveLength(2));
    vi.useFakeTimers();
    fireEvent.change(field(), { target: { value: 'Be' } });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    fireEvent.change(field(), { target: { value: 'Berlin' } });
    await act(async () => vi.advanceTimersByTimeAsync(399));
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/search'))).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/search'))).toHaveLength(1);
  });

  it('ignores superseded results even when an old request finishes last', async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/languages'))
        return Response.json([{ code: 'en', name: 'English', autonym: 'English' }]);
      if (JSON.parse(init!.body as string).query === 'Berlin')
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return Response.json({ results: [{ ...results[0], title: 'Paris' }], partial: false });
    });
    const user = userEvent.setup();
    renderDialog();
    await user.type(field(), 'Berlin');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/search'))).toBe(true)
    );
    await user.clear(field());
    await user.type(field(), 'Paris');
    await screen.findByRole('option', { name: 'Paris Wikipedia · en' });
    await act(async () => finish(Response.json({ results, partial: false })));
    expect(screen.queryByRole('option', { name: 'Berlin Wikipedia · en' })).not.toBeInTheDocument();
  });

  it('keeps import errors inline and allows retrying the same URL', async () => {
    const user = userEvent.setup();
    onCreate.mockRejectedValueOnce(new Error('Revision is not publicly readable.'));
    renderDialog();
    await user.click(field());
    await user.paste('https://en.wikipedia.org/w/index.php?oldid=123');
    await user.click(screen.getByRole('button', { name: 'Import article' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revision is not publicly readable.'
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Import article' }));
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it('shows empty results and search errors without blocking URL imports', async () => {
    fetchMock.mockImplementation(async (path: string) =>
      path.endsWith('/languages')
        ? Response.json([])
        : Response.json({ results: [], partial: false })
    );
    const user = userEvent.setup();
    renderDialog();
    await user.type(field(), 'Nothing');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No articles found'));
    fetchMock.mockResolvedValue(Response.json({ error: 'Search unavailable' }, { status: 400 }));
    await user.type(field(), ' else');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search unavailable');
    await user.click(field());
    await user.paste('https://en.wikipedia.org/wiki/Berlin');
    expect(onCreate).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
