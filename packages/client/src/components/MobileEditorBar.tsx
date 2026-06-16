import { Eye, FileCode, Settings } from 'lucide-react';

import type { ViewMode } from '@/components/DocumentEditor';
import { Button } from '@/components/ui/button';

interface MobileEditorBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function MobileEditorBar({
  viewMode,
  onViewModeChange,
  onToggleSidebar,
  sidebarOpen,
}: MobileEditorBarProps) {
  return (
    <div className="md:hidden border-t bg-background safe-area-bottom">
      <div className="flex items-center justify-around py-1.5 px-2">
        <Button
          variant={viewMode === 'source' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('source')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-4"
          data-testid="mobile-view-source"
        >
          <FileCode className="h-5 w-5" />
          <span className="text-[10px]">Source</span>
        </Button>

        <Button
          variant={viewMode !== 'source' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('split')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-4"
          data-testid="mobile-view-preview"
        >
          <Eye className="h-5 w-5" />
          <span className="text-[10px]">Preview</span>
        </Button>

        <Button
          variant={sidebarOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleSidebar}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-4"
          data-testid="mobile-toggle-settings"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px]">Settings</span>
        </Button>
      </div>
    </div>
  );
}
