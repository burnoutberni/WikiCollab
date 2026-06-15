import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { SplitPaneEditor } from './SplitPaneEditor';

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
  const defaultProps = {
    content: 'Hello wikitext',
    onChange: vi.fn(),
    documentId: 'doc1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWikitextEditor.mockReset();
    mockPreviewLinkModal.mockReset();
    global.fetch = vi.fn();
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

  it('link click opens PreviewLinkModal', async () => {
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
});
