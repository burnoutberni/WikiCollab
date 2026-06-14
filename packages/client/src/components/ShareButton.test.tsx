import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ShareButton } from './ShareButton';

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ShareButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:5173' },
      writable: true,
      configurable: true,
    });
  });

  it('renders share link', () => {
    renderWithProviders(<ShareButton documentId="abc123" />);
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/doc/abc123');
  });

  it('copies URL to clipboard on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ShareButton documentId="abc123" />);
    const link = screen.getByRole('link');
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(link);
    expect(writeTextSpy).toHaveBeenCalledWith('http://localhost:5173/doc/abc123');
  });

  it('shows label when showLabel is true', () => {
    renderWithProviders(<ShareButton documentId="abc123" showLabel />);
    expect(screen.getByText('Share')).toBeInTheDocument();
  });
});
