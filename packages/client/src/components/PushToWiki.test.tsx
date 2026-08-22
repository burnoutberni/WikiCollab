import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { PushToWiki } from './PushToWiki';

vi.mock('lucide-react', () => {
  const m = (props: { className?: string }) =>
    props?.className ? <div className={props.className} /> : <div />;
  return {
    default: m,
    ...Object.fromEntries(['Check', 'Copy', 'ExternalLink', 'Send', 'X'].map((name) => [name, m])),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('PushToWiki', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a read-only pretty target URL derived from the document title and instance', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <PushToWiki
        title="Ada Lovelace"
        content="'''Ada'''"
        instanceApiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));

    expect(screen.queryByLabelText(/target page title/i)).not.toBeInTheDocument();
    expect(screen.getByText('2. Edit wiki page')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Target edit URL' })).not.toBeInTheDocument();
    expect(screen.getByText('https://en.wikipedia.org/wiki/Ada_Lovelace')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /open editor/i })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/w/index.php?title=Ada+Lovelace&action=edit'
    );
  });

  it('maps root-level api.php instances to root-level index.php editors', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <PushToWiki
        title="Ada Lovelace"
        content="'''Ada'''"
        instanceApiUrl="https://wiki.example/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));

    expect(screen.getByText('https://wiki.example/wiki/Ada_Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open editor/i })).toHaveAttribute(
      'href',
      'https://wiki.example/index.php?title=Ada+Lovelace&action=edit'
    );
  });

  it('encodes reserved title characters in pretty and editor URLs', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <PushToWiki
        title="A&B #Q?/Sub"
        content="content"
        instanceApiUrl="https://wiki.example/w/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));

    expect(screen.getByText('https://wiki.example/wiki/A%26B_%23Q%3F%2FSub')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open editor/i })).toHaveAttribute(
      'href',
      'https://wiki.example/w/index.php?title=A%26B+%23Q%3F%2FSub&action=edit'
    );
  });

  it('updates the displayed target URL while the dialog is open', async () => {
    const user = userEvent.setup();

    const { rerender } = renderWithProviders(
      <PushToWiki
        title="First Page"
        content="content"
        instanceApiUrl="https://wiki.example/w/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));
    expect(screen.getByText('https://wiki.example/wiki/First_Page')).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <PushToWiki
          title="Second Page"
          content="content"
          instanceApiUrl="https://wiki.example/w/api.php"
        />
      </TooltipProvider>
    );

    expect(screen.getByText('https://wiki.example/wiki/Second_Page')).toBeInTheDocument();
    expect(screen.queryByText('https://wiki.example/wiki/First_Page')).not.toBeInTheDocument();
  });

  it('shows an inline message when clipboard copy fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));

    renderWithProviders(
      <PushToWiki
        title="Ada Lovelace"
        content="'''Ada'''"
        instanceApiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));
    await user.click(screen.getByRole('button', { name: /^copy$/i }));

    expect(screen.getByText(/copy failed/i)).toBeInTheDocument();
  });

  it('copies the wikitext and confirms the copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    renderWithProviders(
      <PushToWiki
        title="Ada Lovelace"
        content="'''Ada'''"
        instanceApiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));
    await user.click(screen.getByRole('button', { name: /^copy$/i }));

    expect(writeText).toHaveBeenCalledWith("'''Ada'''");
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();
  });

  it('resets copied state when wikitext changes while open', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const { rerender } = renderWithProviders(
      <PushToWiki
        title="Ada Lovelace"
        content="'''Ada'''"
        instanceApiUrl="https://en.wikipedia.org/w/api.php"
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));
    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <PushToWiki
          title="Ada Lovelace"
          content="'''Ada Lovelace'''"
          instanceApiUrl="https://en.wikipedia.org/w/api.php"
        />
      </TooltipProvider>
    );

    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^copied$/i })).not.toBeInTheDocument();
  });

  it('disables target URL editing and opening without a configured instance', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <PushToWiki title="Ada Lovelace" content="'''Ada'''" instanceApiUrl={null} />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));

    expect(screen.queryByText(/^https?:\/\//)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open editor/i })).toBeDisabled();
  });
});
