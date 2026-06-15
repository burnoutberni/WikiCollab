export interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  expiry: string | null;
  mediawiki_instance_id: string | null;
  restored_version_id: string | null;
}

export interface MediaWikiInstance {
  id: string;
  name: string;
  api_url: string;
  token: string | null;
  configured_at: string;
  css: string | null;
}

export interface DocumentRevision {
  id: string;
  document_id: string;
  yjs_state: string | null;
  starred: boolean;
  created_at: string;
}

export type Version = DocumentRevision;

export interface TemplateCache {
  id: string;
  instance_id: string;
  template_name: string;
  template_data: string;
  fetched_at: string;
}

export interface CreateDocumentRequest {
  title?: string;
  content?: string;
  slug?: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  mediawiki_instance_id?: string | null;
  expiry?: string | null;
}

export interface CreateInstanceRequest {
  name: string;
  api_url: string;
  token?: string;
}

export interface PushToWikiRequest {
  api_url: string;
  token: string;
  title?: string;
  content?: string;
  summary?: string;
}

export type ViewMode = 'source' | 'split' | 'wysiwyg';

export interface CursorPresence {
  userId: string;
  userName: string;
  color: string;
  cursor: { anchor: number; head: number } | null;
}

export interface SourceMapEntry {
  sourceLine: number;
  blockIndex: number;
}

export interface PreviewResponse {
  html: string;
  sourceMap: SourceMapEntry[];
}

export interface StarPayload {
  versionId: string;
  starred: boolean;
}

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
