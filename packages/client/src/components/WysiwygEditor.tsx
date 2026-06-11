import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import * as Y from 'yjs';

interface WysiwygEditorProps {
  content: string;
  onChange: (value: string) => void;
  ytext?: Y.Text | null;
  ydoc?: Y.Doc | null;
}

function wikitextToHtml(wikitext: string): string {
  let html = wikitext;

  html = html.replace(/^======\s*(.*?)\s*======$/gm, '<h6>$1</h6>');
  html = html.replace(/^=====\s*(.*?)\s*=====$/gm, '<h5>$1</h5>');
  html = html.replace(/^====\s*(.*?)\s*====$/gm, '<h4>$1</h4>');
  html = html.replace(/^===\s*(.*?)\s*===$/gm, '<h3>$1</h3>');
  html = html.replace(/^==\s*(.*?)\s*==$/gm, '<h2>$1</h2>');
  html = html.replace(/^=\s*(.*?)\s*=$/gm, '<h1>$1</h1>');

  html = html.replace(/'''(.*?)'''/g, '<strong>$1</strong>');
  html = html.replace(/''(.*?)''/g, '<em>$1</em>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');

  html = html.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '<a href="#">$2</a>');
  html = html.replace(/\[https?:\/\/[^\s]+ ([^\]]*)\]/g, '<a href="#">$1</a>');

  html = html.replace(/\{\{([^}]*)\}\}/g, '<span class="template">{{$1}}</span>');

  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  html = html.replace(/\n/g, '<br>');

  return html;
}

function htmlToWikitext(html: string): string {
  let wikitext = html;

  wikitext = wikitext.replace(/<h1>(.*?)<\/h1>/g, '= $1 =');
  wikitext = wikitext.replace(/<h2>(.*?)<\/h2>/g, '== $1 ==');
  wikitext = wikitext.replace(/<h3>(.*?)<\/h3>/g, '=== $1 ===');
  wikitext = wikitext.replace(/<h4>(.*?)<\/h4>/g, '==== $1 ====');
  wikitext = wikitext.replace(/<h5>(.*?)<\/h5>/g, '===== $1 =====');
  wikitext = wikitext.replace(/<h6>(.*?)<\/h6>/g, '====== $1 ======');

  wikitext = wikitext.replace(/<strong>(.*?)<\/strong>/g, "'''$1'''");
  wikitext = wikitext.replace(/<b>(.*?)<\/b>/g, "'''$1'''");
  wikitext = wikitext.replace(/<em>(.*?)<\/em>/g, "''$1''");
  wikitext = wikitext.replace(/<i>(.*?)<\/i>/g, "''$1''");
  wikitext = wikitext.replace(/<s>(.*?)<\/s>/g, '~~$1~~');
  wikitext = wikitext.replace(/<del>(.*?)<\/del>/g, '~~$1~~');

  wikitext = wikitext.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[[$2]]');

  wikitext = wikitext.replace(/<span class="template">\{\{(.*?)\}\}<\/span>/g, '{{$1}}');

  wikitext = wikitext.replace(/<p>(.*?)<\/p>/gs, '$1');
  wikitext = wikitext.replace(/<br\s*\/?>/g, '\n');
  wikitext = wikitext.replace(/<\/?[^>]+(>|$)/g, '');

  return wikitext.trim();
}

export function WysiwygEditor({ content, onChange, ytext, ydoc }: WysiwygEditorProps) {
  const lastExternalContent = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing your article...',
      }),
    ],
    content: wikitextToHtml(content),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const wikitext = htmlToWikitext(html);
      lastExternalContent.current = wikitext;
      onChange(wikitext);
    },
  });

  useEffect(() => {
    if (!editor || !ytext || !ydoc) return;

    const observer = (_event: Y.YTextEvent) => {
      const newContent = ytext.toString();
      if (newContent !== lastExternalContent.current) {
        lastExternalContent.current = newContent;
        const html = wikitextToHtml(newContent);
        editor.commands.setContent(html);
      }
    };

    ytext.observe(observer);

    return () => {
      ytext.unobserve(observer);
    };
  }, [editor, ytext, ydoc]);

  useEffect(() => {
    if (!editor) return;

    if (content !== lastExternalContent.current) {
      lastExternalContent.current = content;
      const html = wikitextToHtml(content);
      editor.commands.setContent(html);
    }
  }, [content, editor]);

  if (!editor) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Loading editor...</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 h-full focus:outline-none"
      />
    </div>
  );
}
