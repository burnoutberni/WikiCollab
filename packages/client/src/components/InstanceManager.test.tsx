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

  it('disables configured actions while saving', () => {
    renderWithProviders(
      <InstanceManager
        {...defaultProps}
        name="English Wikipedia"
        apiUrl="https://en.wikipedia.org/w/api.php"
        saving={true}
      />
    );

    expect(screen.getByRole('button', { name: 'Edit instance' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear instance' })).toBeDisabled();
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

  it('hides external link for invalid configured URLs', () => {
    renderWithProviders(
      <InstanceManager {...defaultProps} name="Invalid Wiki" apiUrl="javascript:alert(1)" />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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

    expect(defaultProps.onChange).toHaveBeenCalledWith('My Wiki', 'https://my.wiki/w/api.php');
  });

  it('rejects non-http API URLs before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Bad Wiki');
    await user.type(within(dialog).getByLabelText('API URL'), 'javascript:alert(1)');
    await user.click(within(dialog).getByText('Save'));

    expect(
      await within(dialog).findByText('MediaWiki API URL must be a valid http(s) URL')
    ).toBeInTheDocument();
    expect(defaultProps.onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  it('exposes preset dropdown combobox semantics', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByRole('combobox', { name: 'Name' });
    await user.click(nameInput);
    await user.keyboard('{ArrowDown}');

    expect(nameInput).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByRole('listbox')).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /english wikipedia/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('closes preset dropdown instead of dialog on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InstanceManager {...defaultProps} />);

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByRole('combobox', { name: 'Name' });
    await user.click(nameInput);
    expect(within(dialog).getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps dialog open and shows save errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InstanceManager
        {...defaultProps}
        onChange={vi.fn().mockRejectedValue(new Error('Save failed'))}
      />
    );

    await user.click(screen.getByText('Configure Instance'));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'My Wiki');
    await user.type(within(dialog).getByLabelText('API URL'), 'https://my.wiki/w/api.php');
    await user.click(within(dialog).getByText('Save'));

    expect(await within(dialog).findByText('Save failed')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Edit instance' }));

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

    await user.click(screen.getByRole('button', { name: 'Clear instance' }));

    expect(defaultProps.onChange).toHaveBeenCalledWith(null, null);
  });

  it('shows clear errors without throwing from the click handler', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InstanceManager
        {...defaultProps}
        name="English Wikipedia"
        apiUrl="https://en.wikipedia.org/w/api.php"
        onChange={vi.fn().mockRejectedValue(new Error('Clear failed'))}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Clear instance' }));

    expect(await screen.findByText('Clear failed')).toBeInTheDocument();
  });
});
