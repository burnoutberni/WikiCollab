import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

  it('disables target URL editing and opening without a configured instance', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <PushToWiki
        title="Ada Lovelace"
        content="'''Ada'''"
        instanceApiUrl={null}
      />
    );

    await user.click(screen.getByRole('button', { name: /publish/i }));

    expect(screen.queryByText(/^https?:\/\//)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open editor/i })).toBeDisabled();
  });
});
