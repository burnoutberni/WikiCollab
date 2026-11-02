import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { BottomSheet } from './BottomSheet';
import { DocumentVisibilityControl } from './DocumentVisibilityControl';

function SheetWithConfirmation() {
  const [open, setOpen] = useState(true);

  return (
    <BottomSheet open={open} onOpenChange={setOpen} title="Settings">
      <DocumentVisibilityControl visibility="unlisted" onChange={() => {}} />
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  it('stays open when Escape dismisses a nested dialog', async () => {
    const user = userEvent.setup();
    render(<SheetWithConfirmation />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    expect(screen.getByText('Make this document public?')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByText('Make this document public?')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});
