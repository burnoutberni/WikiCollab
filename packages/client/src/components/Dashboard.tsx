import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Plus, FileText, Trash2, Clock, ArrowDown } from 'lucide-react';
import { useDocuments } from '@/hooks/useApi';

export function Dashboard() {
  const { documents, loading, pendingCount, loadPending, createDocument, deleteDocument } = useDocuments();
  const navigate = useNavigate();

  const handleCreate = useCallback(async () => {
    const doc = await createDocument('Untitled');
    navigate(`/doc/${doc.id}`);
  }, [createDocument, navigate]);

  const handleOpen = useCallback((id: string) => {
    navigate(`/doc/${id}`);
  }, [navigate]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument(id);
    }
  }, [deleteDocument]);

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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Card
                key={doc.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDelete(e, doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {doc.content?.substring(0, 150) || 'No content yet'}
                  </p>
                  <Separator className="mt-3 mb-2" />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                      {doc.id}
                    </span>
                    {doc.mediawiki_instance_id && (
                      <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                        Wiki linked
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
