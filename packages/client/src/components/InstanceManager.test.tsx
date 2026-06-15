import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { MediaWikiInstance } from '@/hooks/useApi';

import { InstanceManager } from './InstanceManager';

const mockInstance: MediaWikiInstance = {
  id: 'test123',
  name: 'English Wikipedia',
  api_url: 'https://en.wikipedia.org/w/api.php',
  token: null,
  configured_at: '2025-01-01T00:00:00Z',
  css: null,
};

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('InstanceManager', () => {
  const defaultProps = {
    instances: [] as MediaWikiInstance[],
    loading: false,
    createInstance: vi.fn().mockResolvedValue(mockInstance),
    deleteInstance: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    renderWithProviders(<InstanceManager {...defaultProps} loading={true} />);
    expect(screen.getByText('Loading instances...')).toBeInTheDocument();
  });

  it('shows add button when no instances', () => {
    renderWithProviders(<InstanceManager {...defaultProps} />);
    expect(screen.getByText('MediaWiki Instance')).toBeInTheDocument();
    expect(screen.getByText('Add Instance')).toBeInTheDocument();
  });

  it('shows instance when configured', () => {
    renderWithProviders(<InstanceManager {...defaultProps} instances={[mockInstance]} />);
    expect(screen.getByText('English Wikipedia')).toBeInTheDocument();
    expect(screen.getByText(mockInstance.api_url)).toBeInTheDocument();
  });

  it('opens add dialog when clicking Add Instance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Add Instance'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add MediaWiki Instance')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('API URL')).toBeInTheDocument();
  });

  it('calls createInstance with form values on save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Add Instance'));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'My Wiki');
    await user.type(within(dialog).getByLabelText('API URL'), 'https://my.wiki/w/api.php');

    await user.click(within(dialog).getByText('Add'));

    expect(defaultProps.createInstance).toHaveBeenCalledWith(
      'My Wiki',
      'https://my.wiki/w/api.php'
    );
  });

  it('disables save button when fields are empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Add Instance'));

    const dialog = await screen.findByRole('dialog');
    const addButton = within(dialog).getByText('Add').closest('button')!;
    expect(addButton).toBeDisabled();
  });

  it('opens delete confirmation when clicking trash icon', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} instances={[mockInstance]} />);

    const card = screen.getByText('English Wikipedia').closest('.rounded-md')!;
    const trashButton = card.querySelector('button[class*="text-destructive"]')!;
    await user.click(trashButton);

    const confirmDialog = await screen.findByRole('alertdialog');
    expect(within(confirmDialog).getByText('Remove instance?')).toBeInTheDocument();
  });

  it('calls deleteInstance on confirm', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} instances={[mockInstance]} />);

    const card = screen.getByText('English Wikipedia').closest('.rounded-md')!;
    const trashButton = card.querySelector('button[class*="text-destructive"]')!;
    await user.click(trashButton);

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByText('Remove'));

    expect(defaultProps.deleteInstance).toHaveBeenCalledWith('test123');
  });

  it('does not call deleteInstance on cancel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} instances={[mockInstance]} />);

    const card = screen.getByText('English Wikipedia').closest('.rounded-md')!;
    const trashButton = card.querySelector('button[class*="text-destructive"]')!;
    await user.click(trashButton);

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByText('Cancel'));

    expect(defaultProps.deleteInstance).not.toHaveBeenCalled();
  });
});
