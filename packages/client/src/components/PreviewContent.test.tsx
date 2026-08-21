import { render, screen } from '@testing-library/react';
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
});
