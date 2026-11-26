import { describe, expect, it } from 'vitest';

import { CreateDocumentSchema, PreviewSchema } from './schemas';

describe('Document content validation', () => {
  it.each([50001, 250000, 1000000])(
    'accepts %i characters for creation and previews without truncation',
    (length) => {
      const content = 'x'.repeat(length);
      expect(CreateDocumentSchema.parse({ content }).content).toBe(content);
      expect(PreviewSchema.parse({ wikitext: content }).wikitext).toBe(content);
    }
  );

  it('still rejects non-string content', () => {
    expect(CreateDocumentSchema.safeParse({ content: 123 }).success).toBe(false);
    expect(PreviewSchema.safeParse({ wikitext: 123 }).success).toBe(false);
  });
});
