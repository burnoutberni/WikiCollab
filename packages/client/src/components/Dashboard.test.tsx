import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DocumentVisibility } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocuments } from '@/hooks/useApi';

import { Dashboard } from './Dashboard';

const mockDocuments = [
  {
    id: 'doc1',
    title: 'Alpha Doc',
    content: 'Alpha content',
    created_at: '2025-01-03T00:00:00Z',
    updated_at: '2025-01-03T00:00:00Z',
    expiry: null,
    mediawiki_instance_id: null,
    restored_version_id: null,
    visibility: 'public' as DocumentVisibility,
  },
  {
    id: 'doc2',
    title: 'Beta Doc',
    content: 'Beta content',
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    expiry: null,
    mediawiki_instance_id: null,
    restored_version_id: null,
    visibility: 'public' as DocumentVisibility,
  },
  {
    id: 'doc3',
    title: 'Gamma Doc',
    content: 'Gamma content',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    expiry: null,
    mediawiki_instance_id: null,
    restored_version_id: null,
    visibility: 'public' as DocumentVisibility,
  },
];

const mockCreateDocument = vi.fn().mockResolvedValue(mockDocuments[0]);
const mockLoadPending = vi.fn();
const mockNavigate = vi.fn();
let mockIsMobile = false;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/hooks/useApi', () => ({
  useDocuments: vi.fn(),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock('lucide-react', () => {
  const m = (props: { className?: string }) =>
    props?.className ? <span className={props.className} /> : <span />;
  return {
    default: m,
    ...Object.fromEntries(
      [
        'ArrowDown',
        'ArrowUpDown',
        'Check',
        'ChevronDown',
        'Clock',
        'FileText',
        'Link2',
        'Plus',
        'Search',
        'Share2',
      ].map((n) => [n, m])
    ),
  };
});

const useDocumentsMock = vi.mocked(useDocuments);

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <TooltipProvider>{ui}</TooltipProvider>
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile = false;
    useDocumentsMock.mockReturnValue({
      documents: [],
      loading: false,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    localStorage.clear();
  });

  it('shows loading state', () => {
    useDocumentsMock.mockReturnValue({
      documents: [],
      loading: true,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();
  });

  it('shows empty state when no documents exist', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });

  it('renders document list with titles', () => {
    useDocumentsMock.mockReturnValue({
      documents: mockDocuments,
      loading: false,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Alpha Doc')).toBeInTheDocument();
    expect(screen.getByText('Beta Doc')).toBeInTheDocument();
    expect(screen.getByText('Gamma Doc')).toBeInTheDocument();
  });

  it('search filtering', async () => {
    const user = userEvent.setup();
    useDocumentsMock.mockReturnValue({
      documents: mockDocuments,
      loading: false,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);

    const searchInput = screen.getByPlaceholderText('Search documents...');
    await user.type(searchInput, 'Alpha');

    expect(screen.getByText('Alpha Doc')).toBeInTheDocument();
    expect(screen.queryByText('Beta Doc')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Doc')).not.toBeInTheDocument();
  });

  it('sort by newest/oldest/alpha/alpha-rev', async () => {
    const user = userEvent.setup();
    useDocumentsMock.mockReturnValue({
      documents: mockDocuments,
      loading: false,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);

    const cards = screen.getAllByText(/Doc$/);
    expect(cards[0]).toHaveTextContent('Alpha Doc');

    await user.click(screen.getByText('Oldest first'));
    const oldestCards = screen.getAllByText(/Doc$/);
    expect(oldestCards[0]).toHaveTextContent('Gamma Doc');

    await user.click(screen.getByText('A–Z'));
    const alphaCards = screen.getAllByText(/Doc$/);
    expect(alphaCards[0]).toHaveTextContent('Alpha Doc');

    await user.click(screen.getByText('Z–A'));
    const revCards = screen.getAllByText(/Doc$/);
    expect(revCards[0]).toHaveTextContent('Gamma Doc');
  });

  it('create document button opens chooser and creates a public document', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Dashboard />);

    await user.click(screen.getAllByRole('button', { name: 'New Document' })[0]);
    await user.click(screen.getByRole('button', { name: /Public document/i }));

    expect(mockCreateDocument).toHaveBeenCalledWith({
      title: 'Untitled',
      content: expect.any(String),
      visibility: 'public',
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/doc/doc1');
    });
  });

  it('creates an unlisted document from the chooser', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Dashboard />);

    await user.click(screen.getAllByRole('button', { name: 'New Document' })[0]);
    await user.click(screen.getByRole('button', { name: /Anyone with the link/i }));

    expect(mockCreateDocument).toHaveBeenCalledWith({
      title: 'Untitled',
      content: expect.any(String),
      visibility: 'unlisted',
    });
  });

  it('uses the mobile bottom sheet chooser on small screens', async () => {
    const user = userEvent.setup();
    mockIsMobile = true;

    renderWithProviders(<Dashboard />);

    await user.click(screen.getAllByRole('button', { name: 'New Document' })[0]);

    expect(screen.getByRole('heading', { name: 'New Document' })).toBeInTheDocument();
    expect(screen.getByText('Choose document type')).toBeInTheDocument();
  });

  it('clicking a document card navigates to it', async () => {
    const user = userEvent.setup();
    useDocumentsMock.mockReturnValue({
      documents: [mockDocuments[0]],
      loading: false,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);

    const card = screen.getByText('Alpha Doc').closest('.cursor-pointer')!;
    await user.click(card);

    expect(mockNavigate).toHaveBeenCalledWith('/doc/doc1');
  });

  it('pending documents banner appears', () => {
    useDocumentsMock.mockReturnValue({
      documents: mockDocuments,
      loading: false,
      pendingCount: 2,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);

    expect(screen.getByText('2 new documents')).toBeInTheDocument();
  });
});
