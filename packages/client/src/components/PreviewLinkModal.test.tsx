import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewLinkModal } from './PreviewLinkModal';

describe('PreviewLinkModal', () => {
  const defaultProps = {
    url: 'https://en.wikipedia.org/wiki/Example',
    open: false,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders URL in dialog when open', () => {
    render(<PreviewLinkModal {...defaultProps} open={true} />);
    expect(screen.getByText('https://en.wikipedia.org/wiki/Example')).toBeInTheDocument();
    expect(screen.getByText('Follow Link')).toBeInTheDocument();
  });

  it('does not render when not open', () => {
    render(<PreviewLinkModal {...defaultProps} open={false} />);
    expect(screen.queryByText('Follow Link')).not.toBeInTheDocument();
    expect(screen.queryByText('https://en.wikipedia.org/wiki/Example')).not.toBeInTheDocument();
  });

  it('clicking "Open in New Tab" calls window.open and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<PreviewLinkModal {...defaultProps} open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByText('Open in New Tab'));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://en.wikipedia.org/wiki/Example',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);

    windowOpenSpy.mockRestore();
  });

  it('clicking "Cancel" closes dialog', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<PreviewLinkModal {...defaultProps} open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByText('Cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('onOpenChange callback is called', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<PreviewLinkModal {...defaultProps} open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByText('Cancel'));

    expect(onOpenChange).toHaveBeenCalled();
  });
});
