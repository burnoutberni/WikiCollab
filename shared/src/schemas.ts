import { z } from 'zod';

export const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

export const CreateDocumentSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  slug: z
    .string()
    .max(100)
    .regex(SLUG_REGEX, 'Slug can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  expiry: z.string().datetime().nullable().optional(),
  mediawiki_instance_id: z.string().max(100).nullable().optional(),
});

export const UpdateDocumentSchema = z.object({
  title: z.string().max(500).optional(),
  mediawiki_instance_id: z.string().max(100).nullable().optional(),
  expiry: z.string().datetime().nullable().optional(),
});

export const PushToWikiSchema = z.object({
  api_url: z.string().url({ protocol: /^https?$/ }),
  token: z.string().min(1, 'token is required'),
  title: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  summary: z.string().max(500).optional(),
});

export const PreviewSchema = z.object({
  wikitext: z.string().optional(),
  api_url: z
    .string()
    .url({ protocol: /^https?$/ })
    .optional(),
  page: z.string().max(200).optional(),
});

export const CssSchema = z.object({
  api_url: z.string().url({ protocol: /^https?$/ }),
});
