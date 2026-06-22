import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { SplitPaneEditor } from './SplitPaneEditor';

let mockIsMobile = false;

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => mockIsMobile,
  useMediaQuery: (query: string) => (query === '(min-width: 768px)' ? !mockIsMobile : mockIsMobile),
}));

const mockWikitextEditor = vi.fn();

vi.mock('@/components/WikitextEditor', () => ({
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

describe('SplitPaneEditor', () => {
  const originalFetch = global.fetch;
  const defaultProps = {
    content: 'Hello wikitext',
    onChange: vi.fn(),
    documentId: 'doc1',
  };

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
        '/api/instances/preview',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello wikitext'),
        })
      );
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Preview HTML')).toBeInTheDocument();
    });
  });

  it('link click opens PreviewLinkModal for external links', async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<a href="https://example.com">link</a>' }),
    });

    renderWithProviders(<SplitPaneEditor {...defaultProps} />);

    await vi.waitFor(() => {
      expect(screen.getByText('link')).toBeInTheDocument();
    });

    await user.click(screen.getByText('link'));

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

    await vi.waitFor(() => {
      expect(screen.getByText('go to section 1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('go to section 1'));

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

    await vi.waitFor(() => {
      expect(screen.getByText('mobile link')).toBeInTheDocument();
    });

    await user.click(screen.getByText('mobile link'));

    expect(screen.getByTestId('preview-link-modal')).toBeInTheDocument();
    expect(screen.getByText('URL: https://example.com')).toBeInTheDocument();
  });
});
