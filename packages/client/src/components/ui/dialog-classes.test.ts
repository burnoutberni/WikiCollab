import { describe, expect, it } from 'vitest';

import { DIALOG_CONTENT_CLASSES } from './dialog-classes';

describe('DIALOG_CONTENT_CLASSES', () => {
  it('keeps bottom spacing on full-screen mobile dialogs', () => {
    expect(DIALOG_CONTENT_CLASSES.mobile).toContain('safe-area-bottom-6');
  });

  it('keeps desktop dialogs inset from viewport edges and scrollable when content is tall', () => {
    expect(DIALOG_CONTENT_CLASSES.desktop).toContain('md:max-h-[calc(100dvh-2rem)]');
    expect(DIALOG_CONTENT_CLASSES.desktop).toContain('md:overflow-y-auto');
    expect(DIALOG_CONTENT_CLASSES.desktop).toContain('md:overscroll-contain');
  });
});
