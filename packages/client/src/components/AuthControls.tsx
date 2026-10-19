import { LogIn, LogOut, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useApi';

export function AuthControls() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <span className="text-sm text-muted-foreground">Checking login…</span>;
  }

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href="/auth/login">
          <LogIn className="h-4 w-4 mr-2" />
          Log in with Wikimedia
        </a>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
        <UserRound className="h-4 w-4" />
        {user.wiki_username}
      </span>
      <Button variant="ghost" size="sm" onClick={() => void logout()}>
        <LogOut className="h-4 w-4 mr-2" />
        Log out
      </Button>
    </div>
  );
}
