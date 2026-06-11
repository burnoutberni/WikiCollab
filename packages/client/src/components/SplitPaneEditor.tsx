import { useState, useCallback, useEffect, useRef } from 'react';
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
  apiUrl?: string | null;
  ytext?: Y.Text | null;
  provider?: WebsocketProvider | null;
  onCursorChange?: (anchor: number, head: number) => void;
}

export function SplitPaneEditor({ content, onChange, apiUrl, ytext, provider, onCursorChange }: SplitPaneEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewCss, setPreviewCss] = useState(defaultCss);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async () => {
    const wikitext = ytext ? ytext.toString() : content;
    setLoading(true);
    try {
      const res = await fetch('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext, api_url: apiUrl || null }),
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
  }, [ytext, apiUrl]);

  const debouncedPreview = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchPreview, 500);
  }, [fetchPreview]);

  useEffect(() => {
    fetchPreview();
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [apiUrl]);

  useEffect(() => {
    if (!ytext) return;

    const observer = () => {
      debouncedPreview();
    };

    ytext.observe(observer);

    return () => {
      ytext.unobserve(observer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ytext, debouncedPreview]);

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
      <div className="w-1/2 relative">
        <div className="h-full overflow-auto">
          <style>{previewCss}</style>
          <div
            className="mw-preview-container p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
        <div className="absolute bottom-3 right-3">
          <Button variant="secondary" size="sm" onClick={fetchPreview} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    </div>
  );
}
