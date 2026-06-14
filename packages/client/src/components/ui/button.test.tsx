import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders with default variant', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('text-primary-foreground');
  });

  it('renders with outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('border-input');
    expect(button.className).toContain('bg-background');
  });

  it('renders with ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('hover:bg-accent');
  });

  it('renders with destructive variant', () => {
    render(<Button variant="destructive">Destructive</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-destructive');
    expect(button.className).toContain('text-destructive-foreground');
  });

  it('renders with sm size', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button', { name: /small/i });
    expect(button.className).toContain('h-9');
    expect(button.className).toContain('px-3');
  });

  it('renders with lg size', () => {
    render(<Button size="lg">Large</Button>);
    const button = screen.getByRole('button', { name: /large/i });
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('px-8');
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
