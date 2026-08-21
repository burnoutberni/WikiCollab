import { ExternalLink, Pencil, Plus, Server, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const WIKI_PRESETS: { name: string; api_url: string }[] = [
  { name: 'English Wikipedia', api_url: 'https://en.wikipedia.org/w/api.php' },
  { name: 'German Wikipedia', api_url: 'https://de.wikipedia.org/w/api.php' },
  { name: 'French Wikipedia', api_url: 'https://fr.wikipedia.org/w/api.php' },
  { name: 'Japanese Wikipedia', api_url: 'https://ja.wikipedia.org/w/api.php' },
  { name: 'Spanish Wikipedia', api_url: 'https://es.wikipedia.org/w/api.php' },
  { name: 'Italian Wikipedia', api_url: 'https://it.wikipedia.org/w/api.php' },
  { name: 'Commons', api_url: 'https://commons.wikimedia.org/w/api.php' },
  { name: 'Wikidata', api_url: 'https://www.wikidata.org/w/api.php' },
  { name: 'Wiktionary', api_url: 'https://en.wiktionary.org/w/api.php' },
  { name: 'Wikibooks', api_url: 'https://en.wikibooks.org/w/api.php' },
  { name: 'Wikiquote', api_url: 'https://en.wikiquote.org/w/api.php' },
  { name: 'Wikisource', api_url: 'https://en.wikisource.org/w/api.php' },
  { name: 'Wikivoyage', api_url: 'https://en.wikivoyage.org/w/api.php' },
  { name: 'Meta-Wiki', api_url: 'https://meta.wikimedia.org/w/api.php' },
];

interface InstanceManagerProps {
  name: string | null;
  apiUrl: string | null;
  saving?: boolean;
  onChange: (name: string | null, apiUrl: string | null) => Promise<void> | void;
}

function getWikiBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    return url.origin;
  } catch {
    return apiUrl.replace(/\/w\/api\.php$/, '');
  }
}

/** Configures the current document's MediaWiki target; presets are suggestions only. */
export function InstanceManager({ name, apiUrl, saving = false, onChange }: InstanceManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftApiUrl, setDraftApiUrl] = useState('');
  const [nameOpen, setNameOpen] = useState(false);
  const [nameIndex, setNameIndex] = useState(-1);
  const justSelectedRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const configured = Boolean(name && apiUrl);
  const filteredPresets = WIKI_PRESETS.filter(
    (preset) =>
      preset.name.toLowerCase().includes(draftName.toLowerCase()) ||
      preset.api_url.toLowerCase().includes(draftName.toLowerCase())
  );

  const openDialog = () => {
    setDraftName(name || '');
    setDraftApiUrl(apiUrl || '');
    setNameIndex(-1);
    setNameOpen(false);
    setDialogOpen(true);
  };

  const selectPreset = (preset: { name: string; api_url: string }) => {
    setDraftName(preset.name);
    setDraftApiUrl(preset.api_url);
    justSelectedRef.current = true;
    setNameOpen(false);
    setNameIndex(-1);
    nameInputRef.current?.focus();
  };

  const closeDropdown = () => {
    setNameOpen(false);
    setNameIndex(-1);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!nameOpen) {
        setNameOpen(true);
        setNameIndex(0);
      } else {
        setNameIndex((i) => Math.min(i + 1, filteredPresets.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNameIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (nameOpen && nameIndex >= 0 && nameIndex < filteredPresets.length) {
        selectPreset(filteredPresets[nameIndex]);
      } else {
        closeDropdown();
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      closeDropdown();
    }
  };

  const handleNameFocus = useCallback(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    setNameOpen(true);
  }, []);

  useEffect(() => {
    if (!listRef.current || nameIndex < 0) return;
    const item = listRef.current.children[nameIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [nameIndex]);

  const handleSave = async () => {
    if (!draftName || !draftApiUrl) return;
    await onChange(draftName, draftApiUrl);
    setDialogOpen(false);
  };

  const handleClear = async () => {
    await onChange(null, null);
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Server className="h-4 w-4" />
        <h3 className="text-sm font-medium">MediaWiki Instance</h3>
      </div>

      {configured ? (
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{name}</span>
                <a
                  href={getWikiBaseUrl(apiUrl!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{apiUrl}</div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 w-7 p-0">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit instance</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  disabled={saving}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear instance</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            No wiki is configured. Preview uses the built-in parser until a document wiki is set.
          </p>
          <Button variant="outline" size="sm" onClick={openDialog} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Configure Instance
          </Button>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="md:max-w-md grid-rows-[auto_1fr_auto] md:grid-rows-none">
          <DialogHeader>
            <DialogTitle>Document MediaWiki Instance</DialogTitle>
            <DialogDescription>
              Choose a preset or enter a custom MediaWiki API URL for this document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 relative">
              <Label htmlFor="instance-name">Name</Label>
              <Input
                ref={nameInputRef}
                id="instance-name"
                placeholder="Search presets or enter custom name..."
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setNameOpen(true);
                  setNameIndex(-1);
                }}
                onFocus={handleNameFocus}
                onKeyDown={handleNameKeyDown}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {nameOpen && filteredPresets.length > 0 && (
                <div
                  ref={listRef}
                  className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-0 shadow-md"
                >
                  {filteredPresets.map((preset, i) => (
                    <button
                      key={preset.api_url}
                      type="button"
                      className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                        i === nameIndex ? 'bg-accent' : 'hover:bg-accent'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectPreset(preset);
                      }}
                    >
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{preset.api_url}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="instance-api-url">API URL</Label>
              <Input
                id="instance-api-url"
                value={draftApiUrl}
                onChange={(e) => setDraftApiUrl(e.target.value)}
                placeholder="https://wiki.example.com/w/api.php"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!draftName || !draftApiUrl || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
