import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { InstanceManager } from './InstanceManager';

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('InstanceManager', () => {
  const defaultProps = {
    name: null as string | null,
    apiUrl: null as string | null,
    saving: false,
    onChange: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows saving state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} saving={true} />);

    await user.click(screen.getByText('Configure Instance'));

    expect(screen.getByText('Saving...')).toBeDisabled();
  });

  it('shows configure button when no instance is set', () => {
    renderWithProviders(<InstanceManager {...defaultProps} />);
    expect(screen.getByText('MediaWiki Instance')).toBeInTheDocument();
    expect(screen.getByText('Configure Instance')).toBeInTheDocument();
  });

  it('shows instance when configured', () => {
    renderWithProviders(
      <InstanceManager
        {...defaultProps}
        name="English Wikipedia"
        apiUrl="https://en.wikipedia.org/w/api.php"
      />
    );
    expect(screen.getByText('English Wikipedia')).toBeInTheDocument();
    expect(screen.getByText('https://en.wikipedia.org/w/api.php')).toBeInTheDocument();
  });

  it('opens configure dialog when clicking Configure Instance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Document MediaWiki Instance')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('API URL')).toBeInTheDocument();
  });

  it('calls onChange with form values on save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'My Wiki');
    await user.type(within(dialog).getByLabelText('API URL'), 'https://my.wiki/w/api.php');

    await user.click(within(dialog).getByText('Save'));

    expect(defaultProps.onChange).toHaveBeenCalledWith(
      'My Wiki',
      'https://my.wiki/w/api.php'
    );
  });

  it('disables save button when fields are empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Save')).toBeDisabled();
  });

  it('hides the preset dropdown when no preset matches the search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Name');
    await user.click(nameInput);
    expect(within(dialog).getByText('English Wikipedia')).toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, 'No Such Preset');

    expect(within(dialog).queryByText('English Wikipedia')).not.toBeInTheDocument();
  });

  it('opens edit dialog with existing values', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InstanceManager
        {...defaultProps}
        name="English Wikipedia"
        apiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    const card = screen.getByText('English Wikipedia').closest('.rounded-md')!;
    const editButton = card.querySelector('button:not([class*="text-destructive"])')!;
    await user.click(editButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('English Wikipedia');
    expect(within(dialog).getByLabelText('API URL')).toHaveValue(
      'https://en.wikipedia.org/w/api.php'
    );
  });

  it('clears instance when clicking clear', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InstanceManager
        {...defaultProps}
        name="English Wikipedia"
        apiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    const card = screen.getByText('English Wikipedia').closest('.rounded-md')!;
    const clearButton = card.querySelector('button[class*="text-destructive"]')!;
    await user.click(clearButton);

    expect(defaultProps.onChange).toHaveBeenCalledWith(null, null);
  });
});
