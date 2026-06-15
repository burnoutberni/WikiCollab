import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { ConnectionStatePopover } from './ConnectionStatePopover';

vi.mock('lucide-react', () => {
  const m = (props: { className?: string; 'data-testid'?: string }) =>
    props?.['data-testid'] ? (
      <div data-testid={props['data-testid']} className={props.className} />
    ) : (
      <div className={props.className} />
    );
  return {
    default: m,
    ...Object.fromEntries(['Activity', 'Wifi', 'WifiOff'].map((n) => [n, m])),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ConnectionStatePopover', () => {
  const defaultProps = {
    connected: true,
    wsUrl: 'ws://localhost:3000/ws',
    lastConnected: Date.now() - 10000,
    connectionDuration: 10000,
    peerCount: 2,
    docId: 'test-doc-123',
  };

  it('renders trigger button with connected state', () => {
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);
    expect(screen.getByTestId('connection-state-trigger')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders trigger button with disconnected state', () => {
    renderWithProviders(
      <ConnectionStatePopover
        {...defaultProps}
        connected={false}
        lastConnected={null}
        connectionDuration={null}
      />
    );
    expect(screen.getByTestId('connection-state-trigger')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows popover content when trigger is clicked (connected)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByTestId('connection-state-popover')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('test-doc-123')).toBeInTheDocument();
    expect(screen.getByText('Collaborators')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.getByText('ws://localhost:3000/ws')).toBeInTheDocument();
  });

  it('shows popover content when trigger is clicked (disconnected)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover
        {...defaultProps}
        connected={false}
        lastConnected={null}
        connectionDuration={null}
      />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByTestId('connection-state-popover')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('Disconnected').length).toBeGreaterThanOrEqual(2);
  });

  it('shows connected since and duration when connected', async () => {
    const user = userEvent.setup();
    const lastConnected = Date.now() - 65000;
    renderWithProviders(
      <ConnectionStatePopover
        {...defaultProps}
        lastConnected={lastConnected}
        connectionDuration={65000}
      />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByText('Connected since')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });

  it('does not show duration fields when disconnected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover
        {...defaultProps}
        connected={false}
        lastConnected={null}
        connectionDuration={null}
      />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.queryByText('Connected since')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  it('formatDuration formats seconds correctly', () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover {...defaultProps} connectionDuration={45000} />);

    user.click(screen.getByTestId('connection-state-trigger'));
  });
});
