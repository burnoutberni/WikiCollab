export type DocumentVisibility = 'public' | 'unlisted';

/** Stored document shape returned by the server API. */
export interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  expiry: string | null;
  mediawiki_instance_id: string | null;
  restored_version_id: string | null;
  visibility: DocumentVisibility;
}

/** Saved MediaWiki instance configuration used for preview and push workflows. */
export interface MediaWikiInstance {
  id: string;
  name: string;
  api_url: string;
  token: string | null;
  configured_at: string;
  css: string | null;
}

/** Immutable revision snapshot metadata for restore and starring flows. */
export interface DocumentRevision {
  id: string;
  document_id: string;
  yjs_state: string | null;
  starred: boolean;
  created_at: string;
}

/** Backward-compatible alias used by version-oriented UI code. */
export type Version = DocumentRevision;

/** Cached template payload tied to a specific MediaWiki instance. */
export interface TemplateCache {
  id: string;
  instance_id: string;
  template_name: string;
  template_data: string;
  fetched_at: string;
}

/** Request body accepted when creating a document. */
export interface CreateDocumentRequest {
  title?: string;
  content?: string;
  slug?: string;
  visibility?: DocumentVisibility;
}

/** Request body accepted when patching mutable document metadata. */
export interface UpdateDocumentRequest {
  title?: string;
  mediawiki_instance_id?: string | null;
  expiry?: string | null;
  visibility?: DocumentVisibility;
}

/** Request body for creating or updating a MediaWiki instance entry. */
export interface CreateInstanceRequest {
  name: string;
  api_url: string;
  token?: string;
}

/** Request body for pushing current content to a remote MediaWiki API. */
export interface PushToWikiRequest {
  api_url: string;
  token: string;
  title?: string;
  content?: string;
  summary?: string;
}

/** Supported editor layouts in the client UI. */
export type ViewMode = 'source' | 'split' | 'wysiwyg';

/** Presence payload shared between collaborators over awareness updates. */
export interface CursorPresence {
  userId: string;
  userName: string;
  color: string;
  cursor: { anchor: number; head: number } | null;
}

/** Approximate mapping from rendered preview blocks back to source lines. */
export interface SourceMapEntry {
  sourceLine: number;
  blockIndex: number;
}

/** Preview response returned by the server preview endpoint. */
export interface PreviewResponse {
  html: string;
  sourceMap: SourceMapEntry[];
}

/** Custom WS payload for toggling a stored revision's starred state. */
export interface StarPayload {
  versionId: string;
  starred: boolean;
}

/** Custom WS payload for notifying clients that a revision restore was requested. */
export interface RestorePayload {
  versionId: string;
  documentId: string;
}

export {
  decodeCustomMessage,
  encodeCustomMessage,
  encodeInnerPayload,
  messageCustom,
  wrapCustomMessage,
} from './protocol.js';
export {
  CreateDocumentSchema,
  CssSchema,
  PreviewSchema,
  PushToWikiSchema,
  UpdateDocumentSchema,
} from './schemas.js';
export { replaceYText } from './yjs.js';
export type { z } from 'zod';
