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
    ...Object.fromEntries(['Activity', 'Wifi', 'WifiOff'].map((n) => [n, m])),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ConnectionStatePopover', () => {
  const defaultProps = {
    connected: true,
    lastConnected: Date.now() - 10000,
  };

  it('renders trigger button with connected state', () => {
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);
    expect(screen.getByTestId('connection-state-trigger')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders trigger button with disconnected state', () => {
    renderWithProviders(<ConnectionStatePopover connected={false} lastConnected={null} />);
    expect(screen.getByTestId('connection-state-trigger')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows popover content when trigger is clicked (connected)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByTestId('connection-state-popover')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(2);
  });

  it('shows popover content when trigger is clicked (disconnected)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover connected={false} lastConnected={null} />);

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByTestId('connection-state-popover')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('Disconnected').length).toBeGreaterThanOrEqual(2);
  });

  it('shows connected since and duration when connected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover {...defaultProps} />);

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByText('Connected since')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });

  it('does not show duration fields when disconnected without prior connection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConnectionStatePopover connected={false} lastConnected={null} />);

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.queryByText('Connected since')).not.toBeInTheDocument();
    expect(screen.queryByText('Last connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  it('shows last connected info when disconnected but had prior session connection', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConnectionStatePopover connected={false} lastConnected={Date.now() - 30000} />
    );

    await user.click(screen.getByTestId('connection-state-trigger'));

    expect(screen.getByText('Last connected')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });
});
