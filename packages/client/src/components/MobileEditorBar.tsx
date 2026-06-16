import { Eye, FileCode, FileText, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();

  return (
    <div className="md:hidden border-t bg-background safe-area-bottom">
      <div className="flex items-center py-1.5 px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-3"
        >
          <FileText className="h-5 w-5" />
          <span className="text-[10px]">Docs</span>
        </Button>

        <div className="flex-1 flex justify-center">
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'source' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('source')}
              className="rounded-r-none h-9 px-4"
              data-testid="mobile-view-source"
            >
              <FileCode className="h-4 w-4 mr-1.5" />
              <span className="text-xs">Source</span>
            </Button>
            <Button
              variant={viewMode !== 'source' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('split')}
              className="rounded-l-none h-9 px-4"
              data-testid="mobile-view-preview"
            >
              <Eye className="h-4 w-4 mr-1.5" />
              <span className="text-xs">Preview</span>
            </Button>
          </div>
        </div>

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
