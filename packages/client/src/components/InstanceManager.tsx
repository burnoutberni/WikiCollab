import { useState, useCallback } from 'react';
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
import { Plus, Trash2, Globe } from 'lucide-react';
import { useInstances, type MediaWikiInstance } from '@/hooks/useApi';

interface InstanceManagerProps {
  onSelect?: (instance: MediaWikiInstance | null) => void;
  selectedId?: string | null;
}

export function InstanceManager({ onSelect, selectedId }: InstanceManagerProps) {
  const { instances, loading, createInstance, deleteInstance } = useInstances();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [token, setToken] = useState('');

  const handleCreate = useCallback(async () => {
    if (!name || !apiUrl) return;
    await createInstance(name, apiUrl, token || undefined);
    setName('');
    setApiUrl('');
    setToken('');
    setOpen(false);
  }, [name, apiUrl, token, createInstance]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteInstance(id);
    if (selectedId === id) {
      onSelect?.(null);
    }
  }, [deleteInstance, selectedId, onSelect]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">MediaWiki Instance</Label>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add MediaWiki Instance</DialogTitle>
              <DialogDescription>
                Configure a MediaWiki API endpoint to push articles and fetch templates.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instance-name">Name</Label>
                <Input
                  id="instance-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Wikipedia"
                />
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
                <Label htmlFor="instance-token">API Token (optional)</Label>
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
              <Button onClick={handleCreate} disabled={!name || !apiUrl}>
                Add Instance
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
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleDelete(instance.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
