import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    Object.defineProperty(navigator, 'share', {
      value: undefined,
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

  it('falls back to clipboard when navigator.share fails for non-abort errors', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    const shareSpy = vi
      .mocked(navigator.share)
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');

    renderWithProviders(<ShareButton documentId="abc123" />);
    await user.click(screen.getByRole('link'));

    expect(shareSpy).toHaveBeenCalled();
    expect(writeTextSpy).toHaveBeenCalledWith('http://localhost:5173/doc/abc123');
  });

  it('does not fall back to clipboard when navigator.share is aborted', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    const shareSpy = vi
      .mocked(navigator.share)
      .mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');

    renderWithProviders(<ShareButton documentId="abc123" />);
    await user.click(screen.getByRole('link'));

    expect(shareSpy).toHaveBeenCalled();
    expect(writeTextSpy).not.toHaveBeenCalled();
  });
});
