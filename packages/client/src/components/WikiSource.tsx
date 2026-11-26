import type { WikiAttribution } from 'shared';

export function WikiSource({ source }: { source?: WikiAttribution | null }) {
  if (!source) return null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Imported from a wiki</p>
      <a
        className="underline break-words"
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {source.title} · revision {source.revision_id}
      </a>
      <p>
        Original text and contributors: see the source revision and its page history. The source
        wiki’s license applies.
      </p>
    </div>
  );
}
