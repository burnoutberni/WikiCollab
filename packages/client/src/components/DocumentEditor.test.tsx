import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { DocumentVisibility } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocument } from '@/hooks/useApi';
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
  mediawiki_instance_name: 'English Wikipedia',
  mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php',
  mediawiki_instance_css: '.mw-parser-output { color: red; }',
  restored_version_id: null,
  visibility: 'public' as DocumentVisibility,
};

const mockNavigate = vi.fn();
const mockTakeOver = vi.fn();
const mockEditorHandle = {
  jumpToPosition: vi.fn(),
  scrollToPosition: vi.fn(),
};
const mockConnectionStatePopover = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'test-doc' }),
  };
});

vi.mock('@/hooks/useApi', () => ({
  API_BASE: '/api',
  useDocument: vi.fn(),
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

const mockSplitPaneEditor = vi.fn();

vi.mock('@/components/SplitPaneEditor', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SplitPaneEditor: (props: any) => {
    mockSplitPaneEditor(props);
    return <div data-testid="split-pane-editor">SplitPaneEditor</div>;
  },
}));

vi.mock('@/components/ConnectionStatePopover', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ConnectionStatePopover: (props: any) => {
    mockConnectionStatePopover(props);
    return (
      <div data-testid="connection-state-popover-mock">
        <button type="button" onClick={() => props.onScrollToCursor?.(42)}>
          Trigger scroll cursor
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/VersionHistory', () => ({
  VersionHistory: () => <div data-testid="version-history">VersionHistory</div>,
}));

vi.mock('@/components/WikitextEditor', () => ({
  WikitextEditor: React.forwardRef(function MockWikitextEditor(
    _props,
    ref: React.ForwardedRef<unknown>
  ) {
    React.useImperativeHandle(ref, () => mockEditorHandle);
    return <div data-testid="wikitext-editor">WikitextEditor</div>;
  }),
  WikitextEditorHandle: {},
}));

vi.mock('@/components/CollaboratorList', () => ({
  CollaboratorList: () => <div data-testid="collaborator-list">CollaboratorList</div>,
}));

const mockInstanceManager = vi.fn();

vi.mock('@/components/InstanceManager', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InstanceManager: (props: any) => {
    mockInstanceManager(props);
    return <div data-testid="instance-manager">InstanceManager</div>;
  },
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
        'Globe',
        'Link2',
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    document.title = 'WikiCollab - Collaborative Wikitext Editor';
    mockIsMobile = false;
    mockEditorHandle.jumpToPosition.mockReset();
    mockEditorHandle.scrollToPosition.mockReset();
    mockConnectionStatePopover.mockReset();
    mockSplitPaneEditor.mockReset();
    mockInstanceManager.mockReset();
    localStorage.clear();
    useDocumentMock.mockReturnValue({ document: mockDoc, loading: false, setDocument: vi.fn() });
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
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const mockYDoc = {
      on: vi.fn(),
      off: vi.fn(),
      getText: vi.fn(),
      destroy: vi.fn(),
      clientID: 1,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
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

  it('updates preview parse title and browser title when the document is renamed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentEditor />);

    await vi.waitFor(() => {
      expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ title: 'Test Document' })
      );
      expect(document.title).toBe('Test Document - WikiCollab');
    });

    const titleInput = screen.getByDisplayValue('Test Document');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed Document');

    await vi.waitFor(() => {
      expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ title: 'Renamed Document' })
      );
      expect(document.title).toBe('Renamed Document - WikiCollab');
    });
  });

  it('restores the default browser title after leaving the editor', async () => {
    const { unmount } = renderWithProviders(<DocumentEditor />);

    await vi.waitFor(() => {
      expect(document.title).toBe('Test Document - WikiCollab');
    });

    unmount();

    expect(document.title).toBe('WikiCollab - Collaborative Wikitext Editor');
  });

  it('passes per-document MediaWiki instance props to editor and settings', () => {
    renderWithProviders(<DocumentEditor />);

    expect(mockSplitPaneEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'test-doc',
        apiUrl: 'https://en.wikipedia.org/w/api.php',
        instanceCss: '.mw-parser-output { color: red; }',
      })
    );
    expect(mockInstanceManager).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'English Wikipedia',
        apiUrl: 'https://en.wikipedia.org/w/api.php',
      })
    );
  });

  it('does not pass a new instance API URL to preview until PATCH succeeds', async () => {
    const emptyInstanceDoc = {
      ...mockDoc,
      mediawiki_instance_name: null,
      mediawiki_instance_api_url: null,
      mediawiki_instance_css: null,
    };
    const setDocument = vi.fn();
    useDocumentMock.mockReturnValue({ document: emptyInstanceDoc, loading: false, setDocument });
    let resolvePatch: (value: Response) => void = () => {};
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetch);

    renderWithProviders(<DocumentEditor />);

    expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ apiUrl: null, instanceCss: null, previewRefreshKey: 0 })
    );

    let savePromise: Promise<void> | undefined;
    React.act(() => {
      savePromise = mockInstanceManager.mock.calls
        .at(-1)?.[0]
        .onChange('English Wikipedia', 'https://en.wikipedia.org/w/api.php');
    });

    expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        apiUrl: null,
        instanceCss: null,
        previewRefreshKey: 0,
        previewBusy: true,
        previewLoadingLabel: 'Updating wiki settings...',
      })
    );

    await React.act(async () => {
      resolvePatch({
        ok: true,
        json: async () => ({
          ...emptyInstanceDoc,
          mediawiki_instance_name: 'English Wikipedia',
          mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php',
          mediawiki_instance_css: '.remote-css{}',
        }),
      } as Response);
      await savePromise;
    });

    expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        apiUrl: 'https://en.wikipedia.org/w/api.php',
        instanceCss: '.remote-css{}',
        previewRefreshKey: 1,
        previewBusy: false,
        previewLoadingLabel: undefined,
      })
    );
    expect(setDocument).toHaveBeenCalledWith(
      expect.objectContaining({ mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php' })
    );
  });

  it('refetches instance CSS after PATCH returns before async refresh completes', async () => {
    vi.useFakeTimers();
    const emptyInstanceDoc = {
      ...mockDoc,
      mediawiki_instance_name: null,
      mediawiki_instance_api_url: null,
      mediawiki_instance_css: null,
    };
    const patchedDoc = {
      ...emptyInstanceDoc,
      mediawiki_instance_name: 'English Wikipedia',
      mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php',
    };
    const refreshedDoc = { ...patchedDoc, mediawiki_instance_css: '.refreshed-css{}' };
    const setDocument = vi.fn();
    useDocumentMock.mockReturnValue({ document: emptyInstanceDoc, loading: false, setDocument });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => patchedDoc })
        .mockResolvedValueOnce({ ok: true, json: async () => patchedDoc })
        .mockResolvedValueOnce({ ok: true, json: async () => refreshedDoc })
    );

    renderWithProviders(<DocumentEditor />);

    let savePromise: Promise<void> | undefined;
    React.act(() => {
      savePromise = mockInstanceManager.mock.calls
        .at(-1)?.[0]
        .onChange('English Wikipedia', 'https://en.wikipedia.org/w/api.php');
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await savePromise;
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        apiUrl: 'https://en.wikipedia.org/w/api.php',
        instanceCss: '.refreshed-css{}',
        previewRefreshKey: 1,
      })
    );
    expect(setDocument).toHaveBeenCalledWith(refreshedDoc);
  });

  it('rolls back instance preview props when PATCH fails', async () => {
    const setDocument = vi.fn();
    useDocumentMock.mockReturnValue({ document: mockDoc, loading: false, setDocument });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'Instance update failed' }),
      }))
    );

    renderWithProviders(<DocumentEditor />);

    await expect(
      mockInstanceManager.mock.calls
        .at(-1)?.[0]
        .onChange('German Wikipedia', 'https://de.wikipedia.org/w/api.php')
    ).rejects.toThrow('Instance update failed');

    expect(mockSplitPaneEditor.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        apiUrl: 'https://en.wikipedia.org/w/api.php',
        instanceCss: '.mw-parser-output { color: red; }',
        previewRefreshKey: 0,
        previewBusy: false,
        previewLoadingLabel: undefined,
      })
    );
    expect(setDocument).not.toHaveBeenCalled();
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
    expect(
      screen.getByText(/Changing this updates the visibility state for everyone/i)
    ).toBeInTheDocument();
  });

  it('updates document visibility from desktop settings', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockDoc) });
    vi.stubGlobal('fetch', fetch);

    renderWithProviders(<DocumentEditor />);

    fireEvent.click(screen.getByRole('radio', { name: /Link/i }));
    await vi.advanceTimersByTimeAsync(300);

    expect(fetch).toHaveBeenCalledWith(
      '/api/docs/test-doc',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visibility: 'unlisted' }),
      })
    );
  });

  it('reverts visibility on PATCH failure', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetch);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(<DocumentEditor />);

    fireEvent.click(screen.getByRole('radio', { name: /Link/i }));
    expect(screen.getByRole('radio', { name: /Link/i })).toHaveAttribute('aria-checked', 'true');

    await vi.advanceTimersByTimeAsync(300);

    expect(fetch).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Failed to update visibility:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('replays pending mobile scroll actions as scrolls after switching to source view', async () => {
    const user = userEvent.setup();
    mockIsMobile = true;

    renderWithProviders(<DocumentEditor />);

    await user.click(screen.getByRole('button', { name: 'Trigger scroll cursor' }));

    await vi.waitFor(() => {
      expect(mockEditorHandle.scrollToPosition).toHaveBeenCalledWith(42);
    });
    expect(mockEditorHandle.jumpToPosition).not.toHaveBeenCalled();
  });
});
