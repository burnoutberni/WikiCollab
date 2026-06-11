import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Server, Trash2, Plus, ExternalLink } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

interface InstanceManagerProps {
  instances: MediaWikiInstance[];
  loading: boolean;
  createInstance: (name: string, apiUrl: string, token?: string) => Promise<MediaWikiInstance>;
  deleteInstance: (id: string) => Promise<void>;
}

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
  const [selectedPreset, setSelectedPreset] = useState<{ name: string; api_url: string } | null>(null);
  const justSelectedRef = useRef(false);

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
    setNameOpen(true);
    setDialogOpen(true);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!nameOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNameIndex((i) => Math.min(i + 1, filteredPresets.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNameIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && nameIndex >= 0 && nameIndex < filteredPresets.length) {
      e.preventDefault();
      const preset = filteredPresets[nameIndex];
      setName(preset.name);
      setApiUrl(preset.api_url);
      setSelectedPreset(preset);
      justSelectedRef.current = true;
      setNameOpen(false);
      setNameIndex(-1);
    } else if (e.key === 'Escape') {
      setNameOpen(false);
    }
  };

  const handlePresetSelect = (preset: { name: string; api_url: string }) => {
    setName(preset.name);
    setApiUrl(preset.api_url);
    setSelectedPreset(preset);
    justSelectedRef.current = true;
    setNameOpen(false);
    setNameIndex(-1);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setSelectedPreset(null);
    setNameIndex(-1);
    setNameOpen(true);
  };

  const handleNameFocus = useCallback(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    setNameOpen(true);
  }, []);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add MediaWiki Instance</DialogTitle>
          <DialogDescription>
            Configure a MediaWiki instance for preview and publishing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instance-name">Name</Label>
            <Popover open={nameOpen && filteredPresets.length > 0} onOpenChange={setNameOpen}>
              <PopoverTrigger asChild>
                <Input
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
              </PopoverTrigger>
              <PopoverContent className="p-0">
                <div className="max-h-48 overflow-y-auto">
                  {filteredPresets.map((preset, i) => (
                    <button
                      key={preset.api_url}
                      className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                        i === nameIndex ? 'bg-accent' : 'hover:bg-accent'
                      }`}
                      onClick={() => handlePresetSelect(preset)}
                    >
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {preset.api_url}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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
    return (
      <div className="text-sm text-muted-foreground py-2">
        Loading instances...
      </div>
    );
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
        <Button variant="outline" size="sm" onClick={openAddDialog} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Instance
        </Button>
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
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {instance.api_url}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {dialogContent}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove instance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the MediaWiki instance. You can always add it
              back later.
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
