import { useState } from 'react';
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
import { Server, Trash2, Edit, Plus, ExternalLink } from 'lucide-react';
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
  updateInstance: (id: string, updates: { name?: string; api_url?: string; token?: string }) => Promise<MediaWikiInstance>;
}

export function InstanceManager({
  instances,
  loading,
  createInstance,
  deleteInstance,
  updateInstance,
}: InstanceManagerProps) {
  const instance = instances.length > 0 ? instances[0] : null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<MediaWikiInstance | null>(null);
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [presetSearch, setPresetSearch] = useState('');
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetIndex, setPresetIndex] = useState(-1);

  const filteredPresets = WIKI_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.api_url.toLowerCase().includes(presetSearch.toLowerCase())
  );

  const openAddDialog = () => {
    setEditingInstance(null);
    setName('');
    setApiUrl('');
    setPresetSearch('');
    setPresetIndex(-1);
    setDialogOpen(true);
  };

  const openEditDialog = () => {
    if (!instance) return;
    setEditingInstance(instance);
    setName(instance.name);
    setApiUrl(instance.api_url);
    setPresetSearch('');
    setPresetIndex(-1);
    setDialogOpen(true);
  };

  const handlePresetKeyDown = (e: React.KeyboardEvent) => {
    if (!presetOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPresetIndex((i) => Math.min(i + 1, filteredPresets.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPresetIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (presetIndex >= 0 && presetIndex < filteredPresets.length) {
        const preset = filteredPresets[presetIndex];
        setName(preset.name);
        setApiUrl(preset.api_url);
        setPresetOpen(false);
        setPresetSearch('');
        setPresetIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setPresetOpen(false);
    }
  };

  const handlePresetSelect = (preset: { name: string; api_url: string }) => {
    setName(preset.name);
    setApiUrl(preset.api_url);
    setPresetOpen(false);
    setPresetSearch('');
    setPresetIndex(-1);
  };

  const handleSave = async () => {
    if (!name || !apiUrl) return;
    if (editingInstance) {
      await updateInstance(editingInstance.id, { name, api_url: apiUrl });
    } else {
      await createInstance(name, apiUrl);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!instance) return;
    await deleteInstance(instance.id);
    setDeleteConfirmOpen(false);
  };

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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingInstance ? 'Edit Instance' : 'Add MediaWiki Instance'}
              </DialogTitle>
              <DialogDescription>
                {editingInstance
                  ? 'Update the MediaWiki instance configuration.'
                  : 'Configure a MediaWiki instance for preview and publishing.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Preset</Label>
                <Popover open={presetOpen} onOpenChange={setPresetOpen}>
                  <PopoverTrigger asChild>
                    <Input
                      placeholder="Search presets or enter custom..."
                      value={presetSearch}
                      onChange={(e) => {
                        setPresetSearch(e.target.value);
                        setPresetIndex(-1);
                        setPresetOpen(e.target.value.length > 0);
                      }}
                      onFocus={() => {
                        if (presetSearch.length > 0) setPresetOpen(true);
                      }}
                      onKeyDown={handlePresetKeyDown}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <div className="max-h-48 overflow-y-auto">
                      {filteredPresets.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          No matching presets
                        </div>
                      ) : (
                        filteredPresets.map((preset, i) => (
                          <button
                            key={preset.api_url}
                            className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                              i === presetIndex ? 'bg-accent' : 'hover:bg-accent'
                            }`}
                            onClick={() => handlePresetSelect(preset)}
                          >
                            <span className="font-medium">{preset.name}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {preset.api_url}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instance-name">Name</Label>
                <Input
                  id="instance-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Wiki"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instance-api-url">API URL</Label>
                <Input
                  id="instance-api-url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://wiki.example.com/w/api.php"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!name || !apiUrl}>
                {editingInstance ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
        <div className="flex items-start justify-between">
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
              onClick={openEditDialog}
              className="h-7 w-7 p-0"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingInstance ? 'Edit Instance' : 'Add MediaWiki Instance'}
            </DialogTitle>
            <DialogDescription>
              {editingInstance
                ? 'Update the MediaWiki instance configuration.'
                : 'Configure a MediaWiki instance for preview and publishing.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Preset</Label>
              <Popover open={presetOpen} onOpenChange={setPresetOpen}>
                <PopoverTrigger asChild>
                  <Input
                    placeholder="Search presets or enter custom..."
                    value={presetSearch}
                    onChange={(e) => {
                      setPresetSearch(e.target.value);
                      setPresetIndex(-1);
                      setPresetOpen(e.target.value.length > 0);
                    }}
                    onFocus={() => {
                      if (presetSearch.length > 0) setPresetOpen(true);
                    }}
                    onKeyDown={handlePresetKeyDown}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <div className="max-h-48 overflow-y-auto">
                    {filteredPresets.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        No matching presets
                      </div>
                    ) : (
                      filteredPresets.map((preset, i) => (
                        <button
                          key={preset.api_url}
                          className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                            i === presetIndex ? 'bg-accent' : 'hover:bg-accent'
                          }`}
                          onClick={() => handlePresetSelect(preset)}
                        >
                          <span className="font-medium">{preset.name}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {preset.api_url}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instance-name">Name</Label>
              <Input
                id="instance-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Wiki"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instance-api-url">API URL</Label>
              <Input
                id="instance-api-url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://wiki.example.com/w/api.php"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name || !apiUrl}>
              {editingInstance ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
