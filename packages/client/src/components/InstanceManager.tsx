import { ExternalLink, Plus, Server, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { type MediaWikiInstance } from '@/hooks/useApi';

const WIKI_PRESETS: { name: string; api_url: string }[] = [
  { name: 'English Wikipedia', api_url: 'https://en.wikipedia.org/w/api.php' },
  { name: 'German Wikipedia', api_url: 'https://de.wikipedia.org/w/api.php' },
  { name: 'French Wikipedia', api_url: 'https://fr.wikipedia.org/w/api.php' },
  { name: 'Japanese Wikipedia', api_url: 'https://ja.wikipedia.org/w/api.php' },
  { name: 'Spanish Wikipedia', api_url: 'https://es.wikipedia.org/w/api.php' },
  { name: 'Italian Wikipedia', api_url: 'https://it.wikipedia.org/w/api.php' },
  { name: 'Russian Wikipedia', api_url: 'https://ru.wikipedia.org/w/api.php' },
  { name: 'Chinese Wikipedia', api_url: 'https://zh.wikipedia.org/w/api.php' },
  { name: 'Wiktionary', api_url: 'https://en.wiktionary.org/w/api.php' },
  { name: 'Wikibooks', api_url: 'https://en.wikibooks.org/w/api.php' },
  { name: 'Wikiquote', api_url: 'https://en.wikiquote.org/w/api.php' },
  { name: 'Wikisource', api_url: 'https://en.wikisource.org/w/api.php' },
  { name: 'Wikinews', api_url: 'https://en.wikinews.org/w/api.php' },
  { name: 'Wikiversity', api_url: 'https://en.wikiversity.org/w/api.php' },
  { name: 'Wikidata', api_url: 'https://www.wikidata.org/w/api.php' },
  { name: 'Wikispecies', api_url: 'https://species.wikimedia.org/w/api.php' },
  { name: 'Wikivoyage', api_url: 'https://en.wikivoyage.org/w/api.php' },
  { name: 'Meta-Wiki', api_url: 'https://meta.wikimedia.org/w/api.php' },
  { name: 'Commons', api_url: 'https://commons.wikimedia.org/w/api.php' },
];

/** Props for managing the locally stored MediaWiki instance list. */
interface InstanceManagerProps {
  instances: MediaWikiInstance[];
  loading: boolean;
  createInstance: (name: string, apiUrl: string, token?: string) => Promise<MediaWikiInstance>;
  deleteInstance: (id: string) => Promise<void>;
}

/**
 * Manages a single active MediaWiki instance backed by the `useInstances` local store.
 */
export function InstanceManager({
  instances,
  loading,
  createInstance,
  deleteInstance,
}: InstanceManagerProps) {
  const instance = instances.length > 0 ? instances[0] : null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [nameOpen, setNameOpen] = useState(false);
  const [nameIndex, setNameIndex] = useState(-1);
  const [selectedPreset, setSelectedPreset] = useState<{ name: string; api_url: string } | null>(
    null
  );
  const justSelectedRef = useRef(false);
  const suppressNextFocusRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredPresets = WIKI_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(name.toLowerCase()) ||
      p.api_url.toLowerCase().includes(name.toLowerCase())
  );

  const openAddDialog = () => {
    setName('');
    setApiUrl('');
    setNameIndex(-1);
    setSelectedPreset(null);
    setNameOpen(false);
    suppressNextFocusRef.current = true;
    setDialogOpen(true);
  };

  const selectPreset = (preset: { name: string; api_url: string }) => {
    setName(preset.name);
    setApiUrl(preset.api_url);
    setSelectedPreset(preset);
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
        justSelectedRef.current = true;
        closeDropdown();
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'Tab') {
      closeDropdown();
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setSelectedPreset(null);
    setNameIndex(-1);
    setNameOpen(true);
  };

  const handleNameFocus = useCallback(() => {
    if (suppressNextFocusRef.current) {
      suppressNextFocusRef.current = false;
      return;
    }
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    setNameOpen(true);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current || nameIndex < 0) return;
    const item = listRef.current.children[nameIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [nameIndex]);

  const handleSave = async () => {
    if (!name || !apiUrl) return;
    await createInstance(name, apiUrl);
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!instance) return;
    await deleteInstance(instance.id);
    setDeleteConfirmOpen(false);
  };

  const isPresetLocked = selectedPreset !== null;

  const dialogContent = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="md:max-w-md grid-rows-[auto_1fr_auto] md:grid-rows-none">
        <DialogHeader>
          <DialogTitle>Add MediaWiki Instance</DialogTitle>
          <DialogDescription>
            Configure a MediaWiki instance for preview and publishing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 relative">
            <Label htmlFor="instance-name">Name</Label>
            <Input
              ref={nameInputRef}
              id="instance-name"
              placeholder="Search presets or enter custom name..."
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={handleNameFocus}
              onKeyDown={handleNameKeyDown}
              className="text-left"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {nameOpen && (
              <div
                ref={listRef}
                className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-0 shadow-md"
              >
                {filteredPresets.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No matching presets — type a custom name and API URL below
                  </div>
                ) : (
                  filteredPresets.map((preset, i) => (
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
                      <span className="text-xs text-muted-foreground truncate">
                        {preset.api_url}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="instance-api-url">API URL</Label>
            <Input
              id="instance-api-url"
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
                setSelectedPreset(null);
              }}
              placeholder="https://wiki.example.com/w/api.php"
              disabled={isPresetLocked}
              readOnly={isPresetLocked}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || !apiUrl}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground py-2">Loading instances...</div>;
  }

  if (!instance) {
    return (
      <>
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4" />
          <h3 className="text-sm font-medium">MediaWiki Instance</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Configure a MediaWiki instance for preview rendering and publishing.
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={openAddDialog} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Instance
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add instance</TooltipContent>
        </Tooltip>
        {dialogContent}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Server className="h-4 w-4" />
        <h3 className="text-sm font-medium">MediaWiki Instance</h3>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{instance.name}</span>
              <a
                href={instance.api_url.replace('/w/api.php', '')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{instance.api_url}</div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove instance</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {dialogContent}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove instance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the MediaWiki instance. You can always add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
