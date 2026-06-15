import { ArrowDown, ArrowUpDown, Clock, FileText, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDocuments } from '@/hooks/useApi';

import { ShareButton } from './ShareButton';

type SortKey = 'newest' | 'oldest' | 'alpha' | 'alpha-rev';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  alpha: 'A–Z',
  'alpha-rev': 'Z–A',
};

const SORT_OPTIONS: SortKey[] = ['newest', 'oldest', 'alpha', 'alpha-rev'];

export function Dashboard() {
  const { documents, loading, pendingCount, loadPending, createDocument } = useDocuments();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>(
    () => (localStorage.getItem('wikicollab-sort') as SortKey) || 'newest'
  );

  useEffect(() => {
    localStorage.setItem('wikicollab-sort', sort);
  }, [sort]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let docs = documents;

    if (q) {
      docs = docs.filter(
        (d) =>
          (d.title || '').toLowerCase().includes(q) ||
          (d.content || '').toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q)
      );
    }

    const sorted = [...docs];
    switch (sort) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
        break;
      case 'alpha':
        sorted.sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
        break;
      case 'alpha-rev':
        sorted.sort((a, b) => (b.title || 'Untitled').localeCompare(a.title || 'Untitled'));
        break;
    }

    return sorted;
  }, [documents, search, sort]);

  const handleCreate = useCallback(async () => {
    const doc = await createDocument('Untitled');
    navigate(`/doc/${doc.id}`);
  }, [createDocument, navigate]);

  const handleOpen = useCallback(
    (id: string) => {
      navigate(`/doc/${id}`);
    },
    [navigate]
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">WikiCollab</h1>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Document
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Documents</h2>
            <p className="text-muted-foreground mt-1">
              Create and collaborate on wikitext articles
            </p>
          </div>

          {!loading && documents.length > 0 && (
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <ArrowUpDown className="h-4 w-4 mx-1.5 text-muted-foreground" />
                {SORT_OPTIONS.map((key) => (
                  <Button
                    key={key}
                    variant={sort === key ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSort(key)}
                  >
                    {SORT_LABELS[key]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            {pendingCount > 0 && (
              <div className="absolute -top-3 left-0 right-0 z-10 flex justify-center pointer-events-none">
                <button
                  onClick={loadPending}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary text-primary-foreground px-3.5 py-1.5 text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
                >
                  <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
                  {pendingCount} new document{pendingCount !== 1 ? 's' : ''}
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading documents...</div>
              </div>
            ) : documents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <CardTitle className="text-lg mb-2">No documents yet</CardTitle>
                  <CardDescription className="mb-4">
                    Create your first document to get started
                  </CardDescription>
                  <Button onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Document
                  </Button>
                </CardContent>
              </Card>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">No documents match your search.</div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((doc) => (
                  <Card
                    key={doc.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors group"
                    onClick={() => handleOpen(doc.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {doc.title || 'Untitled'}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(doc.updated_at)}
                          </CardDescription>
                        </div>
                        <ShareButton documentId={doc.id} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {doc.content?.substring(0, 150) || 'No content yet'}
                      </p>
                      <Separator className="mt-3 mb-2" />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{doc.id}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
