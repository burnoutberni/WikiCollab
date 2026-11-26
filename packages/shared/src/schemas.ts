import { z } from 'zod';

/** Restricts document slugs to URL-safe identifiers without spaces or punctuation. */
export const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DocumentVisibilitySchema = z.enum(['public', 'unlisted']);
const MediaWikiApiUrlSchema = z.url({ protocol: /^https?$/ });
const MediaWikiApiKeySchema = z.string().max(4096);

export const WikiImportSchema = z
  .object({
    url: MediaWikiApiUrlSchema.max(4096).optional(),
    api_url: MediaWikiApiUrlSchema.max(4096).optional(),
    title: z.string().min(1).max(500).optional(),
    revision_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .refine((value) => value.url || (value.api_url && (value.title || value.revision_id)), {
    message: 'Provide an article URL, or an API URL and article title or revision.',
  });

export const WikiSearchSchema = z.object({
  wiki: MediaWikiApiUrlSchema.max(4096).optional(),
  language: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,29}$/)
    .default('en'),
  query: z.string().trim().min(1).max(300),
});

/** Validation for document creation requests, including optional custom slugs. */
export const CreateDocumentSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().optional(),
  slug: z
    .string()
    .max(100)
    .regex(SLUG_REGEX, 'Slug can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  expiry: z.string().datetime().nullable().optional(),
  mediawiki_instance_name: z.string().max(200).nullable().optional(),
  mediawiki_instance_api_url: MediaWikiApiUrlSchema.nullable().optional(),
  mediawiki_api_key: MediaWikiApiKeySchema.nullable().optional(),
  mediawiki_bot_username: z.string().max(255).nullable().optional(),
  mediawiki_bot_password: z.string().max(4096).nullable().optional(),
  visibility: DocumentVisibilitySchema.optional(),
  wiki_import: WikiImportSchema.optional(),
});

/** Validation for patching document metadata without replacing content. */
export const UpdateDocumentSchema = z.object({
  title: z.string().max(500).optional(),
  mediawiki_instance_name: z.string().max(200).nullable().optional(),
  mediawiki_instance_api_url: MediaWikiApiUrlSchema.nullable().optional(),
  mediawiki_api_key: MediaWikiApiKeySchema.nullable().optional(),
  mediawiki_bot_username: z.string().max(255).nullable().optional(),
  mediawiki_bot_password: z.string().max(4096).nullable().optional(),
  expiry: z.string().datetime().nullable().optional(),
  visibility: DocumentVisibilitySchema.optional(),
});

/** Validation for preview generation requests; remote parsing is optional. */
export const PreviewSchema = z.object({
  wikitext: z.string().optional(),
  page: z.string().max(200).nullable().optional(),
});
