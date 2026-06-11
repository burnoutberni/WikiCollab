export interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  expiry: string | null;
  mediawiki_instance_id: string | null;
}

export interface MediaWikiInstance {
  id: string;
  name: string;
  api_url: string;
  token: string | null;
  configured_at: string;
}

export interface DocumentRevision {
  id: string;
  document_id: string;
  yjs_state: Uint8Array;
  created_at: string;
}

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
  title: string;
  content: string;
  summary?: string;
}

export type ViewMode = 'source' | 'split' | 'wysiwyg';

export interface CursorPresence {
  userId: string;
  userName: string;
  color: string;
  cursor: { anchor: number; head: number } | null;
}
