import { useState, useCallback } from 'react';
import { WikitextEditor } from './WikitextEditor';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import defaultCss from '@/styles/wikipedia.css?inline';

interface SplitPaneEditorProps {
  content: string;
  onChange: (value: string) => void;
  documentId: string;
  instanceId?: string | null;
  ytext?: Y.Text | null;
  provider?: WebsocketProvider | null;
  onCursorChange?: (anchor: number, head: number) => void;
}

export function SplitPaneEditor({ content, onChange, instanceId, ytext, provider, onCursorChange }: SplitPaneEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewCss, setPreviewCss] = useState(defaultCss);
  const [loading, setLoading] = useState(false);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: content, instance_id: instanceId || null }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html || '<p>Preview not available</p>');
        setPreviewCss(data.css || defaultCss);
      } else {
        setPreviewHtml('<p class="text-red-500">Failed to generate preview</p>');
      }
    } catch {
      setPreviewHtml('<p class="text-red-500">Preview requires a configured MediaWiki instance</p>');
    } finally {
      setLoading(false);
    }
  }, [content, instanceId]);

  return (
    <div className="flex h-full">
      <div className="w-1/2 border-r">
        <WikitextEditor
          content={content}
          onChange={onChange}
          ytext={ytext}
          provider={provider}
          onCursorChange={onCursorChange}
        />
      </div>
      <div className="w-1/2 flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">Preview</span>
          <Button variant="ghost" size="sm" onClick={fetchPreview} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <style>{previewCss}</style>
          <div
            className="mw-preview-container p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}
