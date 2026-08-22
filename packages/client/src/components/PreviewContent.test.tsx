import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PreviewContent } from './PreviewContent';

describe('PreviewContent', () => {
  it('inserts CSS as text so closing style tags cannot create markup', () => {
    render(
      <PreviewContent
        css={'body{color:red}</style><img src=x onerror=alert(1)>'}
        html={'<p>Safe preview</p>'}
        onExternalLink={vi.fn()}
      />
    );

    const shadow = screen.getByTestId('preview-content').shadowRoot!;
    expect(shadow.querySelectorAll('style')).toHaveLength(1);
    expect(shadow.querySelector('style')?.textContent).toContain('</style><img');
    expect(shadow.querySelector('img')).toBeNull();
    expect(shadow.querySelector('.mw-preview-container')?.innerHTML).toBe('<p>Safe preview</p>');
  });

  it('prevents default navigation for javascript links', () => {
    const onExternalLink = vi.fn();
    render(
      <PreviewContent
        css=""
        html={'<a href="javascript:alert(1)">bad link</a>'}
        onExternalLink={onExternalLink}
      />
    );

    const shadow = screen.getByTestId('preview-content').shadowRoot!;
    const link = shadow.querySelector('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, event);

    expect(event.defaultPrevented).toBe(true);
    expect(onExternalLink).not.toHaveBeenCalled();
  });

  it('routes valid external links through the callback and prevents navigation', () => {
    const onExternalLink = vi.fn();
    render(
      <PreviewContent
        css=""
        html={'<a href="https://example.org/wiki/Page">good link</a>'}
        onExternalLink={onExternalLink}
      />
    );

    const shadow = screen.getByTestId('preview-content').shadowRoot!;
    const link = shadow.querySelector('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, event);

    expect(event.defaultPrevented).toBe(true);
    expect(onExternalLink).toHaveBeenCalledWith('https://example.org/wiki/Page');
  });
});
