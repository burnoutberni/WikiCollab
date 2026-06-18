import { useCallback, useEffect, useRef, useState } from 'react';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
}

export function BottomSheet({ open, onOpenChange, children, title }: BottomSheetProps) {
  const previousBodyStyles = useRef<{
    overflow: string;
    position: string;
    width: string;
    top: string;
  } | null>(null);
  const scrollYRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const dragYRef = useRef(0);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (open) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      scrollYRef.current = window.scrollY;
      previousBodyStyles.current = {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        width: document.body.style.width,
        top: document.body.style.top,
      };
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollYRef.current}px`;
      requestAnimationFrame(() => sheetRef.current?.focus());
    } else {
      const previous = previousBodyStyles.current;
      if (previous) {
        document.body.style.overflow = previous.overflow;
        document.body.style.position = previous.position;
        document.body.style.width = previous.width;
        document.body.style.top = previous.top;
        window.scrollTo(0, scrollYRef.current);
      }
      previousFocusRef.current?.focus();
    }
    return () => {
      const previous = previousBodyStyles.current;
      if (previous) {
        document.body.style.overflow = previous.overflow;
        document.body.style.position = previous.position;
        document.body.style.width = previous.width;
        document.body.style.top = previous.top;
      }
      previousFocusRef.current?.focus();
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

  const titleId = title ? 'bottom-sheet-title' : undefined;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !sheetRef.current) return;

    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length === 0) {
      e.preventDefault();
      sheetRef.current.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ transform: `translateY(${dragY}px)` }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="flex justify-center pt-3 pb-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        </div>
        {title && (
          <div className="px-4 pb-3 border-b">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 safe-area-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}
