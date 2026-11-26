import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteDocumentButton } from './DeleteDocumentButton';

const fetchMock = vi.fn();
const onDeleted = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => Response.json({ success: true }));
  onDeleted.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderButton() {
  render(<DeleteDocumentButton documentId="my-doc" title="My draft" onDeleted={onDeleted} />);
}

describe('DeleteDocumentButton', () => {
  it('requires confirmation and cancels without deleting', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('My draft');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This cannot be undone');
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete document' })).toHaveFocus();
  });

  it('deletes through the authenticated API and calls onDeleted only on success', async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/docs/my-doc', {
      method: 'DELETE',
      credentials: 'include',
    });
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps server errors in the confirmation and allows retrying', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: 'Only the owner may delete this document' }, { status: 403 })
    );
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the owner may delete this document'
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('handles non-JSON failures without navigating away', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(new Response('Server unavailable', { status: 503 }));
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete this document. Please try again.'
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('prevents duplicate requests and waits for the server before leaving', async () => {
    const user = userEvent.setup();
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Deleting…' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    await act(async () => finish(Response.json({ success: true })));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});
