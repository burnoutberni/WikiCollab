import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { ConnectionStatePopover } from './ConnectionStatePopover';

vi.mock('lucide-react', () => {
  const m = (props: { className?: string }) =>
    props?.className ? <div className={props.className} /> : <div />;
  return {
    default: m,
    ...Object.fromEntries(['Activity', 'RefreshCw', 'Wifi', 'WifiOff'].map((n) => [n, m])),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ConnectionStatePopover', () => {
  const defaultProps = {
    connected: true,
    lastConnected: Date.now() - 10000,
    documentId: 'doc-123',
    collaboratorCount: 3,
    websocketServerUrl: 'ws://localhost:3000/ws',
    onReconnect: vi.fn(),
  };

  it('renders trigger button with connected state', () => {
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);
    expect(screen.getByTestId('connection-state-trigger')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders trigger button with disconnected state', () => {
    renderWithProviders(
      <ConnectionStatePopover {...defaultProps} connected={false} lastConnected={null} />
    );
    expect(screen.getByTestId('connection-state-trigger')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows popover when trigger is clicked (connected)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByTestId('connection-state-popover')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('doc-123')).toBeInTheDocument();
    expect(screen.getByText('Collaborators')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('WebSocket')).toBeInTheDocument();
    expect(screen.getByText('ws://localhost:3000/ws')).toBeInTheDocument();
    expect(screen.getByText('Connected since')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });

  it('shows popover when trigger is clicked (disconnected)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover {...defaultProps} connected={false} lastConnected={null} />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByTestId('connection-state-popover')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByTestId('connection-retry-btn')).toBeInTheDocument();
  });

  it('shows last connected info when disconnected but had prior session', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover
        {...defaultProps}
        connected={false}
        lastConnected={Date.now() - 30000}
      />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByText('Last connected')).toBeInTheDocument();
  });

  it('does not show last connected fields without prior connection', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover {...defaultProps} connected={false} lastConnected={null} />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.queryByText('Last connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Connected since')).not.toBeInTheDocument();
  });

  it('calls onReconnect when retry button is clicked', async () => {
    const onReconnect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover
        {...defaultProps}
        connected={false}
        lastConnected={null}
        onReconnect={onReconnect}
      />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));
    const retryButton = screen.getByTestId('connection-retry-btn');
    await user.click(retryButton);

    expect(onReconnect).toHaveBeenCalledOnce();
    expect(retryButton).toBeDisabled();
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });

  it('clamps duration to zero when lastConnected is ahead of current time', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover {...defaultProps} lastConnected={Date.now() + 1000} />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByText('0s')).toBeInTheDocument();
  });

  it('adds an accessible name to the trigger button', () => {
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Connection status: Connected' })).toHaveAttribute(
      'type',
      'button'
    );
  });
});
