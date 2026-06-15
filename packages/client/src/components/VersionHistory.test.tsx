import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useVersions } from '@/hooks/useApi';

import { VersionHistory } from './VersionHistory';

const mockVersions = [
  {
    id: 'v1',
    document_id: 'doc1',
    yjs_state: null,
    starred: false,
    created_at: '2025-01-03T00:00:00Z',
  },
  {
    id: 'v2',
    document_id: 'doc1',
    yjs_state: null,
    starred: true,
    created_at: '2025-01-02T00:00:00Z',
  },
];

const mockGetVersionPreview = vi.fn().mockResolvedValue('Preview content');
const mockStarVersion = vi.fn().mockResolvedValue(undefined);
const mockUnstarVersion = vi.fn().mockResolvedValue(undefined);
const mockFetchVersions = vi.fn();
const mockOnRestore = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useVersions: vi.fn(),
}));

vi.mock('lucide-react', () => {
  const m = (props: { className?: string }) =>
    props?.className ? <div className={props.className} /> : <div />;
  return {
    default: m,
    ...Object.fromEntries(['Eye', 'History', 'RotateCcw', 'Star', 'X'].map((n) => [n, m])),
  };
});

const useVersionsMock = vi.mocked(useVersions);

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('VersionHistory', () => {
  const defaultProps = {
    documentId: 'doc1',
    onRestore: mockOnRestore,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useVersionsMock.mockReturnValue({
      versions: [],
      loading: false,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
  });

  it('shows trigger button with "History" text', () => {
    renderWithProviders(<VersionHistory {...defaultProps} />);
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('opens dialog and shows versions', async () => {
    const user = userEvent.setup();
    useVersionsMock.mockReturnValue({
      versions: mockVersions,
      loading: false,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
    renderWithProviders(<VersionHistory {...defaultProps} />);

    await user.click(screen.getByText('History'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Version History')).toBeInTheDocument();
  });

  it('loading state', async () => {
    const user = userEvent.setup();
    useVersionsMock.mockReturnValue({
      versions: [],
      loading: true,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
    renderWithProviders(<VersionHistory {...defaultProps} />);

    await user.click(screen.getByText('History'));

    expect(await screen.findByText('Loading versions...')).toBeInTheDocument();
  });

  it('empty state ("No version history yet")', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VersionHistory {...defaultProps} />);

    await user.click(screen.getByText('History'));

    expect(await screen.findByText('No version history yet')).toBeInTheDocument();
  });

  it('star/unstar actions on versions', async () => {
    const user = userEvent.setup();
    useVersionsMock.mockReturnValue({
      versions: mockVersions,
      loading: false,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
    renderWithProviders(<VersionHistory {...defaultProps} />);

    await user.click(screen.getByText('History'));
    const dialog = await screen.findByRole('dialog');

    const starBtn = within(dialog).getByTitle('Star version');
    await user.click(starBtn);
    expect(mockStarVersion).toHaveBeenCalledWith('v1');

    const unstarBtn = within(dialog).getByTitle('Unstar version');
    await user.click(unstarBtn);
    expect(mockUnstarVersion).toHaveBeenCalledWith('v2');
  });

  it('preview toggle (expand/collapse)', async () => {
    const user = userEvent.setup();
    useVersionsMock.mockReturnValue({
      versions: mockVersions,
      loading: false,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
    renderWithProviders(<VersionHistory {...defaultProps} />);

    await user.click(screen.getByText('History'));
    const dialog = await screen.findByRole('dialog');

    const previewBtn = within(dialog).getAllByRole('button', { name: /preview|close/i })[0];
    await user.click(previewBtn);

    expect(await screen.findByText('Preview content')).toBeInTheDocument();

    await user.click(previewBtn);
    expect(screen.queryByText('Preview content')).not.toBeInTheDocument();
  });

  it('restore button calls onRestore and closes dialog', async () => {
    const user = userEvent.setup();
    useVersionsMock.mockReturnValue({
      versions: mockVersions,
      loading: false,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
    const onRestore = vi.fn();
    renderWithProviders(<VersionHistory {...defaultProps} onRestore={onRestore} />);

    await user.click(screen.getByText('History'));
    const dialog = await screen.findByRole('dialog');

    const restoreBtns = within(dialog).getAllByText('Restore');
    await user.click(restoreBtns[0]);

    expect(onRestore).toHaveBeenCalledWith('v2');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('current version indicator', async () => {
    const user = userEvent.setup();
    useVersionsMock.mockReturnValue({
      versions: mockVersions,
      loading: false,
      fetchVersions: mockFetchVersions,
      starVersion: mockStarVersion,
      unstarVersion: mockUnstarVersion,
      getVersionPreview: mockGetVersionPreview,
    });
    renderWithProviders(<VersionHistory {...defaultProps} />);

    await user.click(screen.getByText('History'));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Current')).toBeInTheDocument();
  });
});
