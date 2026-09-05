import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('blocks javascript links with mixed case and control characters', () => {
    const onExternalLink = vi.fn();
    render(
      <PreviewContent
        css=""
        html={'<a href="&#9;JavaScript:alert(1)">bad link</a>'}
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

  it('blocks active non-http schemes from being opened externally', () => {
    const onExternalLink = vi.fn();
    render(
      <PreviewContent
        css=""
        html={'<a href="data:text/html,<script>alert(1)</script>">bad link</a>'}
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

  describe('cursor and selection overlays', () => {
    const markerHtml = '<p>Hello world</p>';

    it('creates an overlay container inside shadow root', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html={markerHtml}
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay).toHaveAttribute('data-testid', 'preview-cursor-overlay');
    });

    it('applies stale class when markersStale is true', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html={markerHtml}
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
            markersStale
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).toHaveClass('wc-preview-overlay-stale');
    });

    it('removes stale class when markersStale is false', () => {
      const { rerender } = render(
        <PreviewContent
          css=""
          html={markerHtml}
          onExternalLink={vi.fn()}
          markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
          markersStale
        />
      );

      act(() => {
        rerender(
          <PreviewContent
            css=""
            html={markerHtml}
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
            markersStale={false}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).not.toHaveClass('wc-preview-overlay-stale');
    });

    it('does not create overlay when markers array is empty', () => {
      act(() => {
        render(<PreviewContent css="" html={markerHtml} onExternalLink={vi.fn()} markers={[]} />);
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay?.children).toHaveLength(0);
    });

    it('renders caret marker as a positioned caret element', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html='<p>Hello<span data-wc-marker="p1:caret"></span> world</p>'
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 5, head: 5 }]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const caret = shadow.querySelector('.wc-preview-caret');
      expect(caret).not.toBeNull();
    });

    it('renders label with user name near caret', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html='<p>Hello<span data-wc-marker="p1:caret"></span> world</p>'
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 5, head: 5 }]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const label = shadow.querySelector('.wc-preview-label');
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe('Alice');
    });

    it('processes selection range markers in the overlay', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html='<p><span data-wc-marker="p1:start"></span>Hello<span data-wc-marker="p1:end"></span> world</p>'
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 5 }]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const content = shadow.querySelector('.mw-preview-container');
      expect(content?.querySelector('[data-wc-marker="p1:start"]')).not.toBeNull();
      expect(content?.querySelector('[data-wc-marker="p1:end"]')).not.toBeNull();
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).not.toBeNull();
    });

    it('processes template fallback markers in the overlay', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html='<p><span data-wc-marker="p1:template-start"></span>output<span data-wc-marker="p1:template-end"></span></p>'
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 10, head: 15 }]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const content = shadow.querySelector('.mw-preview-container');
      expect(content?.querySelector('[data-wc-marker="p1:template-start"]')).not.toBeNull();
      expect(content?.querySelector('[data-wc-marker="p1:template-end"]')).not.toBeNull();
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).not.toBeNull();
    });

    it('handles multiple peer markers independently', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html='<p><span data-wc-marker="p1:start"></span>Hel<span data-wc-marker="p1:end"></span>lo <span data-wc-marker="p2:caret"></span>world</p>'
            onExternalLink={vi.fn()}
            markers={[
              { id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 3 },
              { id: 'p2', userName: 'Bob', color: '#00FF00', anchor: 4, head: 4 },
            ]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      expect(shadow.querySelector('.wc-preview-caret')).not.toBeNull();
      const content = shadow.querySelector('.mw-preview-container');
      expect(content?.querySelector('[data-wc-marker="p1:start"]')).not.toBeNull();
      expect(content?.querySelector('[data-wc-marker="p1:end"]')).not.toBeNull();
      const labels = shadow.querySelectorAll('.wc-preview-label');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });

    it('clears previous overlays when html changes', () => {
      const { rerender } = render(
        <PreviewContent
          css=""
          html='<p><span data-wc-marker="p1:caret"></span>Hello</p>'
          onExternalLink={vi.fn()}
          markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
        />
      );

      act(() => {
        rerender(
          <PreviewContent
            css=""
            html="<p>New content without markers</p>"
            onExternalLink={vi.fn()}
            markers={[]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay?.children).toHaveLength(0);
    });

    it('hides marker spans visually via CSS rules in shadow root', () => {
      act(() => {
        render(
          <PreviewContent
            css=""
            html='<p><span data-wc-marker="p1:caret"></span>Hello</p>'
            onExternalLink={vi.fn()}
            markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const style = shadow.querySelector('style');
      expect(style?.textContent).toContain('[data-wc-marker]');
      expect(style?.textContent).toContain('overflow:hidden');
    });

    it('does not render overlay when no markers prop is passed', () => {
      act(() => {
        render(<PreviewContent css="" html="<p>Hello</p>" onExternalLink={vi.fn()} />);
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      const overlay = shadow.querySelector('.wc-preview-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay?.children).toHaveLength(0);
    });

    it('re-renders overlays when markers update without html change', () => {
      const { rerender } = render(
        <PreviewContent
          css=""
          html='<p><span data-wc-marker="p1:caret"></span>Hello</p>'
          onExternalLink={vi.fn()}
          markers={[{ id: 'p1', userName: 'Alice', color: '#FF0000', anchor: 0, head: 0 }]}
        />
      );

      act(() => {
        rerender(
          <PreviewContent
            css=""
            html='<p><span data-wc-marker="p1:caret"></span>Hello</p>'
            onExternalLink={vi.fn()}
            markers={[]}
          />
        );
      });

      const shadow = screen.getByTestId('preview-content').shadowRoot!;
      expect(shadow.querySelector('.wc-preview-caret')).toBeNull();
    });
  });
});
