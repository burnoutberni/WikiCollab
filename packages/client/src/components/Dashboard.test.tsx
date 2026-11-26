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
    mediawiki_instance_name: null,
    mediawiki_instance_api_url: null,
    mediawiki_instance_css: null,
    mediawiki_canonical_server: null,
    mediawiki_article_path: null,
    mediawiki_script_path: null,
    restored_version_id: null,
    visibility: 'public' as DocumentVisibility,
    owner_user_id: null,
    is_owner: false,
    has_mediawiki_api_key: false,
    mediawiki_bot_username: null,
    has_mediawiki_bot_password: false,
  },
  {
    id: 'doc2',
    title: 'Beta Doc',
    content: 'Beta content',
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    expiry: null,
    mediawiki_instance_name: null,
    mediawiki_instance_api_url: null,
    mediawiki_instance_css: null,
    mediawiki_canonical_server: null,
    mediawiki_article_path: null,
    mediawiki_script_path: null,
    restored_version_id: null,
    visibility: 'public' as DocumentVisibility,
    owner_user_id: null,
    is_owner: false,
    has_mediawiki_api_key: false,
    mediawiki_bot_username: null,
    has_mediawiki_bot_password: false,
  },
  {
    id: 'doc3',
    title: 'Gamma Doc',
    content: 'Gamma content',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    expiry: null,
    mediawiki_instance_name: null,
    mediawiki_instance_api_url: null,
    mediawiki_instance_css: null,
    mediawiki_canonical_server: null,
    mediawiki_article_path: null,
    mediawiki_script_path: null,
    restored_version_id: null,
    visibility: 'public' as DocumentVisibility,
    owner_user_id: null,
    is_owner: false,
    has_mediawiki_api_key: false,
    mediawiki_bot_username: null,
    has_mediawiki_bot_password: false,
  },
];

const mockCreateDocument = vi.fn().mockResolvedValue(mockDocuments[0]);
const mockLoadPending = vi.fn();
const mockNavigate = vi.fn();
const mockApiFetch = vi.fn();
let mockIsMobile = false;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  useAuth: () => ({ user: { id: 'owner-1', wiki_username: 'Owner' }, loading: false }),
  useDocuments: vi.fn(),
}));

vi.mock('@/components/AuthControls', () => ({ AuthControls: () => <div>AuthControls</div> }));

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
        'Globe',
        'Link2',
        'Plus',
        'Search',
        'Share2',
        'X',
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
    mockApiFetch.mockImplementation(async (path: string) =>
      path.endsWith('/languages')
        ? Response.json([{ code: 'en', name: 'English', autonym: 'English' }])
        : Response.json({
            results: [
              {
                title: 'Berlin',
                api_url: 'https://en.wikipedia.org/w/api.php',
                site_name: 'Wikipedia',
                language: 'en',
              },
            ],
            partial: false,
          })
    );
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

  it.each([false, true])(
    'opens wiki import from the new-document chooser (mobile: %s)',
    async (mobile) => {
      const user = userEvent.setup();
      mockIsMobile = mobile;
      renderWithProviders(<Dashboard />);
      await user.click(screen.getAllByRole('button', { name: 'New Document' })[0]);
      await user.click(screen.getByRole('button', { name: 'Start from a wiki article' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Search articles or paste a URL' })
      ).toBeInTheDocument();
      expect(mockCreateDocument).not.toHaveBeenCalled();
    }
  );

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

  it('imports directly without sending a placeholder title or boilerplate text', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Dashboard />);
    await user.click(screen.getAllByRole('button', { name: 'New Document' })[0]);
    await user.click(screen.getByRole('button', { name: 'Start from a wiki article' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search articles or paste a URL' }),
      'Berlin'
    );
    await user.click(await screen.findByRole('option', { name: 'Berlin Wikipedia · en' }));
    expect(mockCreateDocument).toHaveBeenCalledWith({
      visibility: 'public',
      wiki_import: { api_url: 'https://en.wikipedia.org/w/api.php', title: 'Berlin' },
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/doc/doc1'));
  });

  it('highlights public and link-only documents with visibility badges', () => {
    const linkOnlyDoc = {
      ...mockDocuments[1],
      id: 'doc4',
      title: 'Hidden Doc',
      visibility: 'unlisted' as DocumentVisibility,
    };

    useDocumentsMock.mockReturnValue({
      documents: [mockDocuments[0], linkOnlyDoc],
      loading: false,
      pendingCount: 0,
      loadPending: mockLoadPending,
      createDocument: mockCreateDocument,
      deleteDocument: vi.fn(),
      updateDocument: vi.fn(),
      refetch: vi.fn(),
    });
    renderWithProviders(<Dashboard />);

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Link only')).toHaveAttribute(
      'title',
      "Hidden from other users' listings and search; accessible via link"
    );
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
