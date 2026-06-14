import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    });
  });

  it('renders share link', () => {
    renderWithProviders(<ShareButton documentId="abc123" />);
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/doc/abc123');
  });

  it('copies URL to clipboard on click', () => {
    renderWithProviders(<ShareButton documentId="abc123" />);
    const link = screen.getByRole('link');
    fireEvent.click(link);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:5173/doc/abc123');
  });

  it('shows label when showLabel is true', () => {
    renderWithProviders(<ShareButton documentId="abc123" showLabel />);
    expect(screen.getByText('Share')).toBeInTheDocument();
  });
});
