import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { SplitPaneEditor } from './SplitPaneEditor';

vi.mock('@/styles/wikipedia.css?inline', () => ({ default: '.mw-preview-container{}' }));

let mockIsMobile = false;

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => mockIsMobile,
  useMediaQuery: (query: string) => (query === '(min-width: 768px)' ? !mockIsMobile : mockIsMobile),
}));

const mockWikitextEditor = vi.fn();

vi.mock('@/components/WikitextEditor', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WikitextEditor: (props: any) => {
    mockWikitextEditor(props);
    return <div data-testid="wikitext-editor">WikitextEditor</div>;
  },
  WikitextEditorHandle: {},
}));

const mockPreviewLinkModal = vi.fn();

vi.mock('@/components/PreviewLinkModal', () => ({
  PreviewLinkModal: (props: {
    url: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockPreviewLinkModal(props);
    if (props.open) {
      return <div data-testid="preview-link-modal">URL: {props.url}</div>;
    }
    return null;
  },
}));

vi.mock('lucide-react', () => {
  const m = (props: { className?: string }) =>
    props?.className ? <div className={props.className} /> : <div />;
  return {
    default: m,
    ...Object.fromEntries(['RefreshCw'].map((n) => [n, m])),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  const result = render(<TooltipProvider>{ui}</TooltipProvider>);
  return {
    ...result,
    rerenderWithProviders: (next: React.ReactElement) =>
      result.rerender(<TooltipProvider>{next}</TooltipProvider>),
  };
}

function getPreviewShadowRoot(): ShadowRoot {
  const host = screen.getByTestId('preview-content');
  if (!host.shadowRoot) throw new Error('Preview shadow root was not created');
  return host.shadowRoot;
}

describe('SplitPaneEditor', () => {
  const originalFetch = global.fetch;
  const defaultProps = {
    content: 'Hello wikitext',
    onChange: vi.fn(),
    documentId: 'doc1',
  };

  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile = false;
    mockWikitextEditor.mockReset();
    mockPreviewLinkModal.mockReset();
    global.fetch = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('renders source editor and preview panes', () => {
    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    expect(screen.getByTestId('wikitext-editor')).toBeInTheDocument();
  });

  it('preview shows content from API when no custom message handler exists', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    } as Response);

    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/docs/doc1/preview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ wikitext: 'Hello wikitext', page: null, markerRequests: '[]' }),
        })
      );
    });

    await vi.waitFor(() => {
      expect(getPreviewShadowRoot().textContent).toContain('Preview HTML');
    });
  });

  it('shows a generic preview error when a configured instance request fails', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    renderWithProviders(
      <SplitPaneEditor {...defaultProps} apiUrl="https://en.wikipedia.org/w/api.php" />
    );

    await vi.waitFor(() => {
      expect(getPreviewShadowRoot().textContent).toContain('Failed to generate preview');
    });
    expect(getPreviewShadowRoot().textContent).not.toContain(
      'Preview requires a configured MediaWiki instance'
    );
  });

  it('layers instance CSS inside the preview shadow root only', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html: '' }),
    } as Response);

    renderWithProviders(<SplitPaneEditor {...defaultProps} instanceCss=".instance-css-marker{}" />);

    await vi.waitFor(() => {
      const shadowStyle = getPreviewShadowRoot().querySelector('style')?.textContent || '';
      expect(shadowStyle).toContain('.mw-preview-container');
      expect(shadowStyle).toContain('.instance-css-marker{}');
      const documentStyles = Array.from(document.querySelectorAll('style')).map(
        (style) => style.textContent || ''
      );
      expect(documentStyles.some((text) => text.includes('.instance-css-marker{}'))).toBe(false);
    });
  });

  it('dims preview and shows external loading label', () => {
    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        content=""
        previewBusy
        previewLoadingLabel="Updating wiki settings..."
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Updating wiki settings...');
    expect(document.querySelector('.mw-preview-container')).toHaveClass('opacity-45');
    expect(document.querySelector('.mw-preview-container')).toHaveClass('pointer-events-none');
  });

  it('dims preview and shows rendering label while preview request is pending', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));

    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    expect(await screen.findByRole('status')).toHaveTextContent('Rendering preview...');
    expect(document.querySelector('.mw-preview-container')).toHaveClass('opacity-45');
  });

  it('shows inline badge instead of overlay when preview already has content', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html: '<p>Existing content</p>' }),
      } as Response)
      .mockReturnValueOnce(new Promise<Response>(() => {}));

    const { rerenderWithProviders } = renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(getPreviewShadowRoot().textContent).toContain('Existing content');
    });

    rerenderWithProviders(
      <SplitPaneEditor {...defaultProps} previewBusy previewLoadingLabel="Updating..." />
    );

    const statusEl = screen.getByRole('status');
    expect(statusEl).toHaveTextContent('Updating...');
    expect(document.querySelector('.mw-preview-container')).not.toHaveClass('opacity-45');
    expect(document.querySelector('.mw-preview-container')).not.toHaveClass('pointer-events-none');
  });

  it('preview remains interactive during re-render badge', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html: '<p>Preview text</p>' }),
      } as Response)
      .mockReturnValueOnce(new Promise<Response>(() => {}));

    const { rerenderWithProviders } = renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(getPreviewShadowRoot().textContent).toContain('Preview text');
    });

    rerenderWithProviders(<SplitPaneEditor {...defaultProps} previewBusy />);

    expect(document.querySelector('.mw-preview-container')).not.toHaveClass('pointer-events-none');
  });

  it('aborts stalled HTTP preview requests and clears loading', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementationOnce((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    renderWithProviders(
      <SplitPaneEditor {...defaultProps} apiUrl="https://en.wikipedia.org/w/api.php" />
    );

    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Rendering preview...');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(getPreviewShadowRoot().textContent).toContain('Failed to generate preview');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('clears websocket preview loading when an update is for a different page', async () => {
    let previewUpdate: (payload: {
      html: string;
      page: string;
      requestId?: string;
    }) => void = () => {};
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_update') previewUpdate = handler as typeof previewUpdate;
      return vi.fn();
    });

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Rendering preview...');

    act(() => {
      previewUpdate({
        html: '<p>Ignored</p>',
        page: 'Other page',
        requestId: sendCustomMessage.mock.calls[0][1].requestId,
      });
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(getPreviewShadowRoot().textContent).not.toContain('Ignored');
  });

  it('sends websocket preview requests with client-scoped request ids', async () => {
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    expect(sendCustomMessage).toHaveBeenCalledWith('preview_request', {
      page: 'Same Page',
      requestId: expect.any(String),
      markerRequests: '[]',
    });
  });

  it('accepts websocket preview updates with the active request id', async () => {
    let previewUpdate: (payload: {
      html: string;
      page: string;
      requestId?: string;
    }) => void = () => {};
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_update') previewUpdate = handler as typeof previewUpdate;
      return vi.fn();
    });

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    act(() => {
      previewUpdate({
        html: '<p>Peer preview</p>',
        page: 'Same Page',
        requestId: sendCustomMessage.mock.calls[0][1].requestId,
      });
    });

    expect(getPreviewShadowRoot().textContent).toContain('Peer preview');
  });

  it('accepts websocket preview updates with the active request id in requestIds', async () => {
    let previewUpdate: (payload: {
      html: string;
      page: string;
      requestIds?: string;
    }) => void = () => {};
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_update') previewUpdate = handler as typeof previewUpdate;
      return vi.fn();
    });

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const requestId = sendCustomMessage.mock.calls[0][1].requestId;
    act(() => {
      previewUpdate({
        html: '<p>Collapsed peer preview</p>',
        page: 'Same Page',
        requestIds: JSON.stringify(['other-request', requestId]),
      });
    });

    expect(getPreviewShadowRoot().textContent).toContain('Collapsed peer preview');
  });

  it('falls back to HTTP preview when websocket preview times out', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Fallback preview</p>' }),
    } as Response);
    global.fetch = fetchMock;
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(getPreviewShadowRoot().textContent).toContain('Fallback preview')
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores late websocket previews after HTTP fallback renders', async () => {
    vi.useFakeTimers();
    let previewUpdate: (payload: {
      html: string;
      page: string;
      requestId?: string;
    }) => void = () => {};
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Fallback preview</p>' }),
    } as Response);
    global.fetch = fetchMock;
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_update') previewUpdate = handler as typeof previewUpdate;
      return vi.fn();
    });

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const requestId = sendCustomMessage.mock.calls[0][1].requestId;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await vi.waitFor(() =>
      expect(getPreviewShadowRoot().textContent).toContain('Fallback preview')
    );

    act(() => {
      previewUpdate({ html: '<p>Late websocket preview</p>', page: 'Same Page', requestId });
    });

    expect(getPreviewShadowRoot().textContent).toContain('Fallback preview');
    expect(getPreviewShadowRoot().textContent).not.toContain('Late websocket preview');
  });

  it('ignores pending websocket previews after falling back to HTTP when the socket closes', async () => {
    let previewUpdate: (payload: {
      html: string;
      page: string;
      requestId?: string;
    }) => void = () => {};
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>HTTP preview</p>' }),
    } as Response);
    global.fetch = fetchMock;
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_update') previewUpdate = handler as typeof previewUpdate;
      return vi.fn();
    });

    const { rerenderWithProviders } = renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        previewRefreshKey={0}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const requestId = sendCustomMessage.mock.calls[0][1].requestId;

    rerenderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.CLOSED } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        previewRefreshKey={1}
      />
    );

    await vi.waitFor(() => expect(getPreviewShadowRoot().textContent).toContain('HTTP preview'));

    act(() => {
      previewUpdate({ html: '<p>Late websocket preview</p>', page: 'Same Page', requestId });
    });

    expect(getPreviewShadowRoot().textContent).toContain('HTTP preview');
    expect(getPreviewShadowRoot().textContent).not.toContain('Late websocket preview');
  });

  it('shows an error and clears websocket preview loading on preview_error', async () => {
    let previewError: (payload: { page: string; requestId?: string }) => void = () => {};
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_error') previewError = handler as typeof previewError;
      return vi.fn();
    });

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Rendering preview...');

    act(() => {
      previewError({ page: 'Same Page', requestId: sendCustomMessage.mock.calls[0][1].requestId });
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(getPreviewShadowRoot().textContent).toContain('Failed to generate preview');
  });

  it('link click opens PreviewLinkModal for external links', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<a href="https://example.com">link</a>' }),
    });

    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => expect(getPreviewShadowRoot().textContent).toContain('link'));

    await user.click(getPreviewShadowRoot().querySelector('a')!);

    expect(screen.getByText('URL: https://example.com')).toBeInTheDocument();
  });

  it('internal anchor link does not open modal', async () => {
    const user = userEvent.setup();
    const scrollIntoViewMock = vi.mocked(HTMLElement.prototype.scrollIntoView);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        html: '<a href="#section1">go to section 1</a><div id="section1">Section 1 Content</div>',
      }),
    });

    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => expect(getPreviewShadowRoot().textContent).toContain('go to section 1'));

    await user.click(getPreviewShadowRoot().querySelector('a')!);

    expect(screen.queryByTestId('preview-link-modal')).not.toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('refresh preview button calls fetch preview', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Refreshed preview</p>' }),
    });

    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });

    const refreshBtn = screen.getByRole('button');
    await user.click(refreshBtn);

    await vi.waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
    });
  });

  it('disables refresh while externally busy', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });

    renderWithProviders(<SplitPaneEditor {...defaultProps} previewBusy />);

    expect(screen.getByRole('button', { name: /refresh preview/i })).toBeDisabled();
  });

  it('ignores stale preview responses after a newer request completes', async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html: '<p>New preview</p>' }),
      } as Response);
    global.fetch = fetchMock;

    const { rerenderWithProviders } = renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerenderWithProviders(<SplitPaneEditor {...defaultProps} documentId="doc2" />);

    await vi.waitFor(() => expect(getPreviewShadowRoot().textContent).toContain('New preview'));

    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({ html: '<p>Old preview</p>' }),
      } as Response);
    });

    expect(getPreviewShadowRoot().textContent).toContain('New preview');
    expect(getPreviewShadowRoot().textContent).not.toContain('Old preview');
  });

  it('refreshes preview when previewRefreshKey changes with the same API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });
    global.fetch = fetchMock;

    const { rerenderWithProviders } = renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        apiUrl="https://en.wikipedia.org/w/api.php"
        previewRefreshKey={0}
      />
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    rerenderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        apiUrl="https://en.wikipedia.org/w/api.php"
        previewRefreshKey={1}
      />
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('refreshes preview when documentId changes with the same title and API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });
    global.fetch = fetchMock;

    const { rerenderWithProviders } = renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Same Title"
        apiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerenderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        documentId="doc2"
        title="Same Title"
        apiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('refreshes when entering mobile preview mode', async () => {
    mockIsMobile = true;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });

    const { rerenderWithProviders } = renderWithProviders(
      <SplitPaneEditor {...defaultProps} initialMobileTab="source" />
    );

    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();

    rerenderWithProviders(<SplitPaneEditor {...defaultProps} initialMobileTab="preview" />);

    await vi.waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes immediately once while typing and once after typing pauses', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });
    global.fetch = fetchMock;

    const { rerenderWithProviders } = renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    rerenderWithProviders(<SplitPaneEditor {...defaultProps} content="Hello wikitext!" />);
    rerenderWithProviders(<SplitPaneEditor {...defaultProps} content="Hello wikitext!!" />);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ wikitext: 'Hello wikitext!', page: null, markerRequests: '[]' })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(fetchMock.mock.calls[2][1]?.body).toBe(
      JSON.stringify({ wikitext: 'Hello wikitext!!', page: null, markerRequests: '[]' })
    );

    vi.useRealTimers();
  });

  it('renders mobile source tab when requested', () => {
    mockIsMobile = true;

    renderWithProviders(<SplitPaneEditor {...defaultProps} initialMobileTab="source" />);

    expect(screen.getByTestId('wikitext-editor')).toBeInTheDocument();
  });

  it('renders PreviewLinkModal for intercepted mobile preview links', async () => {
    const user = userEvent.setup();
    mockIsMobile = true;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<a href="https://example.com">mobile link</a>' }),
    });

    renderWithProviders(<SplitPaneEditor {...defaultProps} initialMobileTab="preview" />);

    await vi.waitFor(() => expect(getPreviewShadowRoot().textContent).toContain('mobile link'));

    await user.click(getPreviewShadowRoot().querySelector('a')!);

    expect(screen.getByTestId('preview-link-modal')).toBeInTheDocument();
    expect(screen.getByText('URL: https://example.com')).toBeInTheDocument();
  });

  it('sends peer cursor positions in preview marker requests', async () => {
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());
    const peers = [
      {
        clientId: 1,
        userId: 'user1',
        userName: 'Alice',
        color: '#FF0000',
        cursor: { anchor: 5, head: 5 },
      },
    ];

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Test"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        peers={peers}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const payload = sendCustomMessage.mock.calls[0][1];
    expect(payload.page).toBe('Test');
    expect(typeof payload.markerRequests).toBe('string');
    const markers = JSON.parse(payload.markerRequests as string);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      id: 'peer-1',
      userName: 'Alice',
      color: '#FF0000',
      anchor: 5,
      head: 5,
    });
  });

  it('sends selection range markers when anchor differs from head', async () => {
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());
    const peers = [
      {
        clientId: 2,
        userId: 'user2',
        userName: 'Bob',
        color: '#00FF00',
        cursor: { anchor: 0, head: 10 },
      },
    ];

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        peers={peers}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const markers = JSON.parse(sendCustomMessage.mock.calls[0][1].markerRequests as string);
    expect(markers[0].anchor).toBe(0);
    expect(markers[0].head).toBe(10);
  });

  it('shows preview overlay with marker content from websocket', async () => {
    let previewUpdate: (payload: {
      html: string;
      page: string;
      requestId?: string;
    }) => void = () => {};
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn((type, handler) => {
      if (type === 'preview_update') previewUpdate = handler as typeof previewUpdate;
      return vi.fn();
    });
    const peers = [
      {
        clientId: 1,
        userId: 'u1',
        userName: 'Alice',
        color: '#FF0000',
        cursor: { anchor: 3, head: 3 },
      },
    ];

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        title="Page"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        peers={peers}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));

    act(() => {
      previewUpdate({
        html: '<p>Hi<span class="wc-marker" id="peer-1:caret"></span> there</p>',
        page: 'Page',
        requestId: sendCustomMessage.mock.calls[0][1].requestId,
      });
    });

    const shadow = getPreviewShadowRoot();
    expect(shadow.textContent).toContain('Hi there');
    expect(shadow.querySelector('[data-testid="preview-cursor-overlay"]')).not.toBeNull();
  });

  it('marks preview stale while waiting for websocket response', async () => {
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));

    const shadow = getPreviewShadowRoot();
    const overlay = shadow.querySelector('[data-testid="preview-cursor-overlay"]');
    expect(overlay).not.toBeNull();
  });

  it('clamps peer cursor offsets to source bounds', async () => {
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());
    const peers = [
      {
        clientId: 1,
        userId: 'u1',
        userName: 'Alice',
        color: '#FF0000',
        cursor: { anchor: -10, head: 99999 },
      },
    ];

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        content="abc"
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        peers={peers}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const markers = JSON.parse(sendCustomMessage.mock.calls[0][1].markerRequests as string);
    expect(markers[0].anchor).toBe(0);
    expect(markers[0].head).toBe(3);
  });

  it('does not send markers when no peers have cursors', async () => {
    const sendCustomMessage = vi.fn();
    const onCustomMessage = vi.fn(() => vi.fn());
    const peers = [
      {
        clientId: 1,
        userId: 'u1',
        userName: 'Alice',
        color: '#FF0000',
        cursor: null,
      },
    ];

    renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        provider={{ ws: { readyState: WebSocket.OPEN } } as never}
        sendCustomMessage={sendCustomMessage}
        onCustomMessage={onCustomMessage}
        peers={peers}
      />
    );

    await vi.waitFor(() => expect(sendCustomMessage).toHaveBeenCalledTimes(1));
    const markers = JSON.parse(sendCustomMessage.mock.calls[0][1].markerRequests as string);
    expect(markers).toHaveLength(0);
  });

  it('includes markerRequests in HTTP preview fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview</p>' }),
    } as Response);
    global.fetch = fetchMock;
    const peers = [
      {
        clientId: 1,
        userId: 'u1',
        userName: 'Alice',
        color: '#FF0000',
        cursor: { anchor: 2, head: 4 },
      },
    ];

    renderWithProviders(<SplitPaneEditor {...defaultProps} content="abcde" peers={peers} />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.markerRequests).toBeTruthy();
    const markers = JSON.parse(body.markerRequests);
    expect(markers).toHaveLength(1);
    expect(markers[0].userName).toBe('Alice');
  });
});
