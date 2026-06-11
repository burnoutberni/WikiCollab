import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, Globe, Pencil, Search } from 'lucide-react';
import { type MediaWikiInstance } from '@/hooks/useApi';

interface WikiPreset {
  name: string;
  apiUrl: string;
}

const WIKI_PRESETS: WikiPreset[] = [
  { name: 'Wikipedia (English)', apiUrl: 'https://en.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Deutsch)', apiUrl: 'https://de.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Français)', apiUrl: 'https://fr.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Español)', apiUrl: 'https://es.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (日本語)', apiUrl: 'https://ja.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (中文)', apiUrl: 'https://zh.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Русский)', apiUrl: 'https://ru.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Português)', apiUrl: 'https://pt.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Italiano)', apiUrl: 'https://it.wikipedia.org/w/api.php' },
  { name: 'Wikipedia (Polski)', apiUrl: 'https://pl.wikipedia.org/w/api.php' },
  { name: 'Wikimedia Commons', apiUrl: 'https://commons.wikimedia.org/w/api.php' },
  { name: 'Wikidata', apiUrl: 'https://www.wikidata.org/w/api.php' },
  { name: 'Wiktionary (English)', apiUrl: 'https://en.wiktionary.org/w/api.php' },
  { name: 'Wikiquote (English)', apiUrl: 'https://en.wikiquote.org/w/api.php' },
  { name: 'Wikibooks (English)', apiUrl: 'https://en.wikibooks.org/w/api.php' },
  { name: 'Wikisource (English)', apiUrl: 'https://en.wikisource.org/w/api.php' },
  { name: 'Wikiversity (English)', apiUrl: 'https://en.wikiversity.org/w/api.php' },
  { name: 'MediaWiki.org', apiUrl: 'https://www.mediawiki.org/w/api.php' },
  { name: 'Meta-Wiki', apiUrl: 'https://meta.wikimedia.org/w/api.php' },
];

interface InstanceManagerProps {
  instances: MediaWikiInstance[];
  loading: boolean;
  createInstance: (name: string, apiUrl: string, token?: string) => Promise<MediaWikiInstance>;
  deleteInstance: (id: string) => Promise<void>;
  updateInstance: (id: string, updates: { name?: string; api_url?: string; token?: string }) => Promise<MediaWikiInstance>;
  onSelect?: (instance: MediaWikiInstance | null) => void;
  selectedId?: string | null;
}

export function InstanceManager({ instances, loading, createInstance, deleteInstance, updateInstance, onSelect, selectedId }: InstanceManagerProps) {
  const [open, setOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<MediaWikiInstance | null>(null);
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const presetsRef = useRef<HTMLDivElement>(null);

  const filteredPresets = useMemo(() => {
    if (!name) return WIKI_PRESETS;
    const q = name.toLowerCase();
    return WIKI_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.apiUrl.toLowerCase().includes(q)
    );
  }, [name]);

  useEffect(() => {
    if (!showPresets) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        presetsRef.current && !presetsRef.current.contains(e.target as Node) &&
        nameRef.current && !nameRef.current.contains(e.target as Node)
      ) {
        setShowPresets(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPresets]);

  const resetForm = useCallback(() => {
    setName('');
    setApiUrl('');
    setToken('');
    setShowPresets(false);
    setEditingInstance(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name || !apiUrl) return;
    await createInstance(name, apiUrl, token || undefined);
    resetForm();
    setOpen(false);
  }, [name, apiUrl, token, createInstance, resetForm]);

  const handleEdit = useCallback(async () => {
    if (!editingInstance || !name || !apiUrl) return;
    await updateInstance(editingInstance.id, {
      name,
      api_url: apiUrl,
      token: token || undefined,
    });
    resetForm();
    setOpen(false);
  }, [editingInstance, name, apiUrl, token, updateInstance, resetForm]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteInstance(id);
    if (selectedId === id) {
      onSelect?.(null);
    }
  }, [deleteInstance, selectedId, onSelect]);

  const openCreateDialog = useCallback(() => {
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const openEditDialog = useCallback((instance: MediaWikiInstance) => {
    setEditingInstance(instance);
    setName(instance.name);
    setApiUrl(instance.api_url);
    setToken('');
    setShowPresets(false);
    setOpen(true);
  }, []);

  const selectPreset = useCallback((preset: WikiPreset) => {
    setName(preset.name);
    setApiUrl(preset.apiUrl);
    setShowPresets(false);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">MediaWiki Instance</Label>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingInstance ? 'Edit MediaWiki Instance' : 'Add MediaWiki Instance'}</DialogTitle>
              <DialogDescription>
                {editingInstance
                  ? 'Update the configuration for this MediaWiki instance.'
                  : 'Search for a wiki or enter a custom name and API URL.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instance-name">Name</Label>
                <div className="relative">
                  {!editingInstance && (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  )}
                  <Input
                    ref={nameRef}
                    id="instance-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!editingInstance) setShowPresets(true);
                    }}
                    onFocus={() => { if (!editingInstance) setShowPresets(true); }}
                    placeholder={editingInstance ? 'Instance name' : 'Search Wikipedia, Commons...'}
                    className={!editingInstance ? 'pl-9' : undefined}
                  />
                  {!editingInstance && showPresets && (
                    <div
                      ref={presetsRef}
                      className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
                    >
                      {filteredPresets.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Custom instance — enter the API URL below
                        </div>
                      ) : (
                        filteredPresets.map((preset) => (
                          <button
                            key={preset.apiUrl}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex flex-col"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectPreset(preset);
                            }}
                          >
                            <span className="font-medium">{preset.name}</span>
                            <span className="text-xs text-muted-foreground truncate">{preset.apiUrl}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instance-url">API URL</Label>
                <Input
                  id="instance-url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://en.wikipedia.org/w/api.php"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instance-token">
                  API Token {editingInstance ? '(leave blank to keep current)' : '(optional)'}
                </Label>
                <Input
                  id="instance-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Bot password or API token"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={editingInstance ? handleEdit : handleCreate}
                disabled={!name || !apiUrl}
              >
                {editingInstance ? 'Save Changes' : 'Add Instance'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading instances...</p>
      ) : instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">No instances configured</p>
      ) : (
        <div className="space-y-1">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                selectedId === instance.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <button
                className="flex items-center gap-2 flex-1 text-left"
                onClick={() => onSelect?.(instance)}
              >
                <Globe className="h-4 w-4" />
                <span className="truncate">{instance.name}</span>
              </button>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => openEditDialog(instance)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleDelete(instance.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
