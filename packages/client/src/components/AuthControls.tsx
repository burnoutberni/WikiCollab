import { LogIn, LogOut, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useApi';

export function AuthControls({ isOwner = false, stacked = false }: { isOwner?: boolean; stacked?: boolean }) {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <span className="text-sm text-muted-foreground">Checking login…</span>;
  }

  if (!user) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="outline">
            <a href="/auth/login">
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
    <div className={stacked ? 'flex flex-col gap-2' : 'flex items-center gap-2'}>
      <div className="flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
          <UserRound className="h-4 w-4" />
          {user.wiki_username}
        </span>
        {isOwner && (
          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">Owner</span>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" className={stacked ? 'w-fit' : undefined} onClick={() => void logout()}>
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </TooltipTrigger>
        <TooltipContent>Log out of your Wikimedia account</TooltipContent>
      </Tooltip>
    </div>
  );
}
