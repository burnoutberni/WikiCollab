import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useApi';

export function AuthControls({ isOwner = false, stacked = false }: { isOwner?: boolean; stacked?: boolean }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return <span className="text-sm text-muted-foreground">Checking login…</span>;
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="outline" className={stacked ? 'w-full' : undefined}>
            <a href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <LogIn className="h-4 w-4 mr-2" />
              Log in with Wikimedia
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Sign in with your Wikimedia account</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="truncate">{user.wiki_username}</span>
      </span>
      {isOwner && (
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium shrink-0">Owner</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 ml-auto"
            aria-label="Log out"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Log out of your Wikimedia account</TooltipContent>
      </Tooltip>
    </div>
  );
}
