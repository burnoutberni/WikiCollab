import { useEffect, useId, useRef, useState } from 'react';
import type {
  CreateDocumentRequest,
  DocumentVisibility,
  WikiImportRequest,
  WikimediaLanguage,
  WikimediaSearchResponse,
} from 'shared';

import { apiFetch } from '@/hooks/useApi';

import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    visibility: DocumentVisibility,
    imported?: CreateDocumentRequest
  ) => Promise<void> | void;
}

function articleUrl(text: string): string | null {
  const value = text.trim();
  // Also accept copied browser addresses without the scheme.
  const candidate = /^https?:\/\//i.test(value)
    ? value
    : /^[\w.-]+\.[a-z]{2,}\//i.test(value)
      ? `https://${value}`
      : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function WikiImportDialog({ open, onOpenChange, onCreate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-4 flex h-fit max-h-[calc(100dvh-2rem)] w-auto flex-col overflow-hidden rounded-lg border p-4 md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:w-full md:overflow-hidden md:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>Start from a wiki article</DialogTitle>
          <DialogDescription className="sr-only">
            Search Wikipedia or paste an article URL to start editing a copy.
          </DialogDescription>
        </DialogHeader>
        {open && <WikiArticlePicker onCreate={onCreate} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WikiArticlePicker({ onCreate, onDone }: Pick<Props, 'onCreate'> & { onDone: () => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState<WikimediaLanguage[]>([
    { code: 'en', name: 'English', autonym: 'English' },
  ]);
  const [response, setResponse] = useState<WikimediaSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(true);
  const creatingRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const url = articleUrl(query);
  const results = response?.results ?? [];
  const showResults = expanded && !creating && !url && results.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await apiFetch('/api/wiki/languages', { signal: controller.signal });
        if (!result.ok) return;
        const available = (await result.json()) as WikimediaLanguage[];
        if (controller.signal.aborted || !available.length) return;
        setLanguages(available);
        const preferred = navigator.languages.flatMap((code) => [
          code.toLowerCase(),
          code.split('-')[0].toLowerCase(),
        ]);
        setLanguage(
          preferred.find((code) => available.some((item) => item.code === code)) ??
            (available.some((item) => item.code === 'en') ? 'en' : available[0].code)
        );
      } catch {
        /* Search can still use English, and URL import does not need this directory. */
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!query.trim() || url || creating) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const result = await apiFetch('/api/wiki/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query.trim(), language }),
            signal: controller.signal,
          });
          const data = await result.json();
          if (!result.ok)
            throw new Error(data.error || 'Search unavailable. Try again or paste an article URL.');
          if (!controller.signal.aborted) {
            setResponse(data);
            setActive(-1);
          }
        } catch (error) {
          if (!controller.signal.aborted)
            setError(error instanceof Error ? error.message : 'Search unavailable.');
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, language, url, creating]);

  useEffect(() => {
    if (active >= 0)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  const create = async (source: WikiImportRequest) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setSearching(false);
    setError('');
    try {
      await onCreate('public', { wiki_import: source });
      onDone();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not import this article. Try again.'
      );
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const resetSuggestions = () => {
    setResponse(null);
    setError('');
    setActive(-1);
    setExpanded(true);
    setSearching(false);
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <form
        className="shrink-0"
        onSubmit={(event) => {
          event.preventDefault();
          if (url) void create({ url });
          else if (showResults && results[active >= 0 ? active : 0]) {
            const result = results[active >= 0 ? active : 0];
            void create({ api_url: result.api_url, title: result.title });
          }
        }}
      >
        <label htmlFor={`${id}-query`} className="mb-2 block text-sm font-medium">
          Search articles or paste a URL
        </label>
        <Input
          ref={input}
          id={`${id}-query`}
          placeholder="Article title or URL…"
          value={query}
          disabled={creating}
          autoComplete="off"
          maxLength={4096}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={!url && !creating ? `${id}-results` : undefined}
          aria-activedescendant={showResults && active >= 0 ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-status`}
          onFocus={() => setExpanded(true)}
          onChange={(event) => {
            resetSuggestions();
            setQuery(event.target.value);
          }}
          onPaste={(event) => {
            const pasted = articleUrl(event.clipboardData.getData('text'));
            if (!pasted) return;
            event.preventDefault();
            resetSuggestions();
            setQuery(pasted);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              if (event.key === 'Enter') event.preventDefault();
              return;
            }
            if (event.key === 'Escape' && expanded && results.length) {
              event.preventDefault();
              event.stopPropagation();
              setExpanded(false);
              setActive(-1);
            } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
              event.preventDefault();
              setExpanded(true);
              setActive((index) =>
                event.key === 'ArrowDown'
                  ? (index + 1) % results.length
                  : index <= 0
                    ? results.length - 1
                    : index - 1
              );
            }
          }}
        />
        {url && !creating && (
          <Button type="submit" className="mt-2" size="sm">
            Import article
          </Button>
        )}
      </form>
      {!url && !creating && (
        <div className="flex min-h-0 flex-col rounded-md border">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
            <span>Wikipedia</span>
            <label htmlFor={`${id}-language`} className="sr-only">
              Search language
            </label>
            <select
              id={`${id}-language`}
              value={language}
              className="min-h-11 max-w-[70%] rounded-md border-0 bg-background px-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              onChange={(event) => {
                resetSuggestions();
                setLanguage(event.target.value);
                input.current?.focus();
              }}
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.autonym}
                  {item.name !== item.autonym ? ` · ${item.name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <ul
            id={`${id}-results`}
            role="listbox"
            aria-label="Wiki articles"
            hidden={!showResults}
            className="min-h-0 max-h-72 overflow-y-auto overscroll-contain border-t p-1"
          >
            {results.map((result, index) => (
              <li
                id={`${id}-option-${index}`}
                key={`${result.api_url}:${result.title}`}
                role="option"
                aria-selected={active === index}
                className={`cursor-pointer rounded-md px-3 py-2 min-h-11 ${active === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void create({ api_url: result.api_url, title: result.title })}
              >
                <div className="text-sm font-medium break-words">{result.title}</div>
                <div className="text-xs text-muted-foreground">
                  {result.site_name} · {result.language || 'Multilingual'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p id={`${id}-status`} role="status" className="shrink-0 text-xs text-muted-foreground">
        {creating
          ? 'Importing article…'
          : url
            ? 'Press Enter or choose Import article to continue.'
            : searching
              ? 'Searching Wikipedia…'
              : response && !results.length
                ? 'No articles found. Try another language or paste a URL.'
                : 'Select a result to start editing.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
