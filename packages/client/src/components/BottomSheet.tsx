import { useCallback, useEffect, useRef, useState } from 'react';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
}

export function BottomSheet({ open, onOpenChange, children, title }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const dragYRef = useRef(0);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, close]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        dragYRef.current = delta;
        setDragY(delta);
      }
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (dragYRef.current > 120) {
      close();
    }
    dragYRef.current = 0;
    setDragY(0);
  }, [close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
        onClick={close}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <div
          className="flex justify-center pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        {title && (
          <div className="px-4 pb-3 border-b">
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 safe-area-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}
