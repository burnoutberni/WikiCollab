import { ArrowLeft, Code, Columns, Settings, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { ViewMode } from '@/components/DocumentEditor';
import { Button } from '@/components/ui/button';

interface MobileEditorBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  collaboratorCount: number;
}

export function MobileEditorBar({
  viewMode,
  onViewModeChange,
  onToggleSidebar,
  sidebarOpen,
  collaboratorCount,
}: MobileEditorBarProps) {
  const navigate = useNavigate();

  return (
    <div className="md:hidden border-t bg-background safe-area-bottom">
      <div className="flex items-center justify-around py-1.5 px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-[10px]">Back</span>
        </Button>

        <Button
          variant={viewMode === 'source' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('source')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
          data-testid="mobile-view-source"
        >
          <Code className="h-5 w-5" />
          <span className="text-[10px]">Source</span>
        </Button>

        <Button
          variant={viewMode === 'split' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('split')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
          data-testid="mobile-view-split"
        >
          <Columns className="h-5 w-5" />
          <span className="text-[10px]">Split</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3 relative"
          data-testid="mobile-toggle-sidebar"
        >
          <Users className="h-5 w-5" />
          <span className="text-[10px]">{collaboratorCount}</span>
        </Button>

        <Button
          variant={sidebarOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleSidebar}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
          data-testid="mobile-toggle-settings"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px]">Settings</span>
        </Button>
      </div>
    </div>
  );
}
