import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InstanceManager } from './InstanceManager';
import type { MediaWikiInstance } from '@/hooks/useApi';

const mockInstance: MediaWikiInstance = {
  id: 'test123',
  name: 'English Wikipedia',
  api_url: 'https://en.wikipedia.org/w/api.php',
  token: null,
  configured_at: '2025-01-01T00:00:00Z',
  css: null,
};

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('InstanceManager', () => {
  const defaultProps = {
    instances: [] as MediaWikiInstance[],
    loading: false,
    createInstance: vi.fn().mockResolvedValue(mockInstance),
    deleteInstance: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    renderWithProviders(<InstanceManager {...defaultProps} loading={true} />);
    expect(screen.getByText('Loading instances...')).toBeInTheDocument();
  });

  it('shows add button when no instances', () => {
    renderWithProviders(<InstanceManager {...defaultProps} />);
    expect(screen.getByText('MediaWiki Instance')).toBeInTheDocument();
    expect(screen.getByText('Add Instance')).toBeInTheDocument();
  });

  it('shows instance when configured', () => {
    renderWithProviders(<InstanceManager {...defaultProps} instances={[mockInstance]} />);
    expect(screen.getByText('English Wikipedia')).toBeInTheDocument();
    expect(screen.getByText(mockInstance.api_url)).toBeInTheDocument();
  });
});
