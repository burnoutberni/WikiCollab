import { z } from 'zod';

/** Restricts document slugs to URL-safe identifiers without spaces or punctuation. */
export const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Validation for document creation requests, including optional custom slugs. */
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

/** Validation for patching document metadata without replacing content. */
export const UpdateDocumentSchema = z.object({
  title: z.string().max(500).optional(),
  mediawiki_instance_id: z.string().max(100).nullable().optional(),
  expiry: z.string().datetime().nullable().optional(),
});

/** Validation for outbound MediaWiki edit requests proxied by the server. */
export const PushToWikiSchema = z.object({
  api_url: z.string().url({ protocol: /^https?$/ }),
  token: z.string().min(1, 'token is required'),
  title: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  summary: z.string().max(500).optional(),
});

/** Validation for preview generation requests; remote parsing is optional. */
export const PreviewSchema = z.object({
  wikitext: z.string().optional(),
  api_url: z
    .string()
    .url({ protocol: /^https?$/ })
    .nullable()
    .optional(),
  page: z.string().max(200).nullable().optional(),
});

/** Validation for fetching wiki CSS bundles from a remote MediaWiki API. */
export const CssSchema = z.object({
  api_url: z.string().url({ protocol: /^https?$/ }),
});
