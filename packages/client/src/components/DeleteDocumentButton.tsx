import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import { API_BASE, apiFetch } from '@/hooks/useApi';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { Button, buttonVariants } from './ui/button';

interface DeleteDocumentButtonProps {
  documentId: string;
  title: string;
  onDeleted: () => void;
}

/** Owner-only action; the server independently enforces authentication and ownership. */
export function DeleteDocumentButton({ documentId, title, onDeleted }: DeleteDocumentButtonProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  const deleteDocument = async () => {
    if (pending.current) return;
    pending.current = true;
    setDeleting(true);
    setError('');
    try {
      const response = await apiFetch(`${API_BASE}/docs/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Could not delete this document. Please try again.');
      }
      setOpen(false);
      onDeleted();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not delete this document. Please try again.'
      );
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending.current) return;
        setError('');
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" className="min-h-11 w-full">
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Delete document
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="md:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes “{title || 'Untitled'}” and its version history for everyone,
            including collaborators. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={deleting}
            onClick={(event) => {
              // Keep the confirmation open until the request succeeds, including on errors.
              event.preventDefault();
              void deleteDocument();
            }}
          >
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
