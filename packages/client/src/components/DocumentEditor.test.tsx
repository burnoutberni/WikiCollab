import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocument, useInstances } from '@/hooks/useApi';
import { useEditorLock } from '@/hooks/useEditorLock';
import { useYjs } from '@/hooks/useYjs';

import { DocumentEditor } from './DocumentEditor';

let mockIsMobile = false;

const mockDoc = {
  id: 'test-doc',
  title: 'Test Document',
  content: 'Hello world',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
  expiry: null,
  mediawiki_instance_id: null,
  restored_version_id: null,
};

const mockNavigate = vi.fn();
const mockTakeOver = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'test-doc' }),
  };
});

vi.mock('@/hooks/useApi', () => ({
  useDocument: vi.fn(),
  useInstances: vi.fn(),
}));

vi.mock('@/hooks/useEditorLock', () => ({
  useEditorLock: vi.fn(),
}));

vi.mock('@/hooks/useYjs', () => ({
  useYjs: vi.fn(),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobile: () => mockIsMobile,
  useMediaQuery: (query: string) => (query === '(min-width: 768px)' ? !mockIsMobile : mockIsMobile),
}));

vi.mock('@/components/SplitPaneEditor', () => ({
  SplitPaneEditor: () => <div data-testid="split-pane-editor">SplitPaneEditor</div>,
}));

vi.mock('@/components/VersionHistory', () => ({
  VersionHistory: () => <div data-testid="version-history">VersionHistory</div>,
}));

vi.mock('@/components/WikitextEditor', () => ({
  WikitextEditor: () => <div data-testid="wikitext-editor">WikitextEditor</div>,
  WikitextEditorHandle: {},
}));

vi.mock('@/components/CollaboratorList', () => ({
  CollaboratorList: () => <div data-testid="collaborator-list">CollaboratorList</div>,
}));

vi.mock('@/components/InstanceManager', () => ({
  InstanceManager: () => <div data-testid="instance-manager">InstanceManager</div>,
}));

vi.mock('@/components/PushToWiki', () => ({
  PushToWiki: () => <div data-testid="push-to-wiki">PushToWiki</div>,
}));

vi.mock('lucide-react', () => {
  const m = (props: { className?: string }) =>
    props?.className ? <div className={props.className} /> : <div />;
  return {
    default: m,
    ...Object.fromEntries(
      [
        'Activity',
        'ArrowLeft',
        'Check',
        'ChevronDown',
        'ChevronRight',
        'Code',
        'Columns',
        'Eye',
        'FileText',
        'FileCode',
        'RefreshCw',
        'Save',
        'Settings',
        'Share2',
        'Users',
        'Wifi',
        'WifiOff',
        'X',
      ].map((n) => [n, m])
    ),
  };
});

const useDocumentMock = vi.mocked(useDocument);
const useInstancesMock = vi.mocked(useInstances);
const useEditorLockMock = vi.mocked(useEditorLock);
const useYjsMock = vi.mocked(useYjs);

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <TooltipProvider>{ui}</TooltipProvider>
    </MemoryRouter>
  );
}

describe('DocumentEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile = false;
    localStorage.clear();
    useDocumentMock.mockReturnValue({ document: mockDoc, loading: false, setDocument: vi.fn() });
    useInstancesMock.mockReturnValue({
      instances: [],
      loading: false,
      createInstance: vi.fn(),
      deleteInstance: vi.fn(),
      updateInstance: vi.fn(),
    });
    useEditorLockMock.mockReturnValue({
      lockedByOther: null,
      takeOver: mockTakeOver,
      claim: vi.fn(),
    });
    const mockYText = {
      toString: () => '',
      observe: vi.fn(),
      unobserve: vi.fn(),
      _length: 0,
      doc: null,
    } as any;
    const mockYDoc = {
      on: vi.fn(),
      off: vi.fn(),
      getText: vi.fn(),
      destroy: vi.fn(),
      clientID: 1,
    } as any;
    useYjsMock.mockReturnValue({
      ydoc: mockYDoc,
      ytext: mockYText,
      connected: true,
      peers: [],
      userId: 'test-user',
      userName: 'Test User',
      userColor: '#FF6B6B',
      setUserName: vi.fn(),
      setUserColor: vi.fn(),
      provider: { connect: vi.fn() },
      getContent: vi.fn().mockReturnValue(''),
      setContent: vi.fn(),
      sendCustomMessage: vi.fn(),
      onCustomMessage: vi.fn(),
      lastConnected: Date.now() - 5000,
    } as any);
  });

  it('shows loading state', () => {
    useDocumentMock.mockReturnValue({ document: null, loading: true, setDocument: vi.fn() });
    renderWithProviders(<DocumentEditor />);
    expect(screen.getByText('Loading document...')).toBeInTheDocument();
  });

  it('shows "Document not found" when doc is null', () => {
    useDocumentMock.mockReturnValue({ document: null, loading: false, setDocument: vi.fn() });
    renderWithProviders(<DocumentEditor />);
    expect(screen.getByText('Document not found')).toBeInTheDocument();
  });

  it('renders editor when doc is loaded', () => {
    renderWithProviders(<DocumentEditor />);
    expect(screen.getByDisplayValue('Test Document')).toBeInTheDocument();
  });

  it('view mode toggling (source/split)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentEditor />);

    await user.click(screen.getByTestId('view-source'));
    expect(screen.getByTestId('wikitext-editor')).toBeInTheDocument();

    await user.click(screen.getByTestId('view-split'));
    expect(screen.getByTestId('split-pane-editor')).toBeInTheDocument();
  });

  it('lock takeover dialog appears', () => {
    useEditorLockMock.mockReturnValue({
      lockedByOther: { tabId: 'other-tab', documentId: 'test-doc', timestamp: Date.now() },
      takeOver: mockTakeOver,
      claim: vi.fn(),
    });
    renderWithProviders(<DocumentEditor />);

    expect(screen.getByText('Session already open')).toBeInTheDocument();
    expect(screen.getByText('Take Over')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
  });

  it('renders the mobile header and bottom action bar in mobile mode', () => {
    mockIsMobile = true;

    renderWithProviders(<DocumentEditor />);

    expect(screen.getByDisplayValue('Test Document')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-toggle-settings')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-share')).toBeInTheDocument();
    expect(screen.queryByTestId('view-source')).not.toBeInTheDocument();
  });

  it('opens the mobile settings bottom sheet', async () => {
    const user = userEvent.setup();
    mockIsMobile = true;

    renderWithProviders(<DocumentEditor />);
    await user.click(screen.getByTestId('mobile-toggle-settings'));

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByTestId('instance-manager')).toBeInTheDocument();
  });
});
