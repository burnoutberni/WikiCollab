import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentVisibilityControl } from './DocumentVisibilityControl';

describe('DocumentVisibilityControl', () => {
  it('switches from public to link-only without confirmation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="public" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Link/i }));

    expect(onChange).toHaveBeenCalledWith('unlisted');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation before making a link-only document public', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Make this document public?')).toBeInTheDocument();
  });

  it('keeps link-only visibility when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    await user.click(screen.getByRole('button', { name: 'Keep link-only' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the selected visibility radio when the dialog closes', async () => {
    const user = userEvent.setup();
    render(<DocumentVisibilityControl visibility="unlisted" onChange={vi.fn()} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    await user.click(screen.getByRole('button', { name: 'Keep link-only' }));

    expect(screen.getByRole('radio', { name: /Link/i })).toHaveFocus();
  });

  it('applies public visibility after confirmation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    await user.click(screen.getByRole('button', { name: 'Make public' }));

    expect(onChange).toHaveBeenCalledWith('public');
  });

  it('aborts when the dialog is dismissed with the close button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aborts when clicking outside the dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    const overlay = document.querySelector('[data-state="open"][class*="bg-black/80"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aborts when the dialog is dismissed with Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Public/i }));
    await user.keyboard('{Escape}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation when switching to public with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DocumentVisibilityControl visibility="unlisted" onChange={onChange} />);

    screen.getByRole('radio', { name: /Link/i }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
