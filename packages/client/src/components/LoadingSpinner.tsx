interface LoadingSpinnerProps {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

/** Reusable loading indicator for route- and component-level suspense boundaries. */
export function LoadingSpinner({
  label = 'Loading...',
  fullScreen = false,
  className = '',
}: LoadingSpinnerProps) {
  const containerClass = fullScreen
    ? 'min-h-screen flex items-center justify-center'
    : 'flex items-center justify-center py-6';

  return (
    <div className={`${containerClass} ${className}`.trim()} role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        <span>{label}</span>
      </div>
    </div>
  );
}
