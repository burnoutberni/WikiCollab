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
  return render(<TooltipProvider>{ui}</TooltipProvider>);
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
          body: JSON.stringify({ wikitext: 'Hello wikitext', page: null }),
        })
      );
    });

    await vi.waitFor(() => {
      expect(getPreviewShadowRoot().textContent).toContain('Preview HTML');
    });
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

    await vi.waitFor(() =>
      expect(getPreviewShadowRoot().textContent).toContain('go to section 1')
    );

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

  it('refreshes preview when previewRefreshKey changes with the same API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });
    global.fetch = fetchMock;

    const { rerender } = renderWithProviders(
      <SplitPaneEditor
        {...defaultProps}
        apiUrl="https://en.wikipedia.org/w/api.php"
        previewRefreshKey={0}
      />
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <TooltipProvider>
        <SplitPaneEditor
          {...defaultProps}
          apiUrl="https://en.wikipedia.org/w/api.php"
          previewRefreshKey={1}
        />
      </TooltipProvider>
    );

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('refreshes when entering mobile preview mode', async () => {
    mockIsMobile = true;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });

    const { rerender } = renderWithProviders(
      <SplitPaneEditor {...defaultProps} initialMobileTab="source" />
    );

    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();

    rerender(
      <TooltipProvider>
        <SplitPaneEditor {...defaultProps} initialMobileTab="preview" />
      </TooltipProvider>
    );

    await vi.waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    });
  });

  it('debounces non-Yjs preview refreshes while typing', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<p>Preview HTML</p>' }),
    });
    global.fetch = fetchMock;

    const { rerender } = renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <TooltipProvider>
        <SplitPaneEditor {...defaultProps} content="Hello wikitext!" />
      </TooltipProvider>
    );
    rerender(
      <TooltipProvider>
        <SplitPaneEditor {...defaultProps} content="Hello wikitext!!" />
      </TooltipProvider>
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

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
});
