import { z } from 'zod';

/** Restricts document slugs to URL-safe identifiers without spaces or punctuation. */
export const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DocumentVisibilitySchema = z.enum(['public', 'unlisted']);
const MediaWikiApiUrlSchema = z.url({ protocol: /^https?$/ });

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
  mediawiki_instance_name: z.string().max(200).nullable().optional(),
  mediawiki_instance_api_url: MediaWikiApiUrlSchema.nullable().optional(),
  visibility: DocumentVisibilitySchema.optional(),
});

/** Validation for patching document metadata without replacing content. */
export const UpdateDocumentSchema = z.object({
  title: z.string().max(500).optional(),
  mediawiki_instance_name: z.string().max(200).nullable().optional(),
  mediawiki_instance_api_url: MediaWikiApiUrlSchema.nullable().optional(),
  expiry: z.string().datetime().nullable().optional(),
  visibility: DocumentVisibilitySchema.optional(),
});

/** Validation for preview generation requests; remote parsing is optional. */
export const PreviewSchema = z.object({
  wikitext: z.string().max(50000).optional(),
  page: z.string().max(200).nullable().optional(),
});
