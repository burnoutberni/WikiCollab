import { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualKeyboardState {
  isVisible: boolean;
  height: number;
}

export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>({
    isVisible: false,
    height: 0,
  });
  const initialHeightRef = useRef<number>(0);

  useEffect(() => {
    const w = window;
    const vapi = w.visualViewport;
    if (!vapi) return;

    initialHeightRef.current = vapi.height;

    const handler = () => {
      const height = vapi.height;
      const isVisible = height < initialHeightRef.current * 0.85;
      setState({ isVisible, height: isVisible ? initialHeightRef.current - height : 0 });
    };

    const handleOrientation = () => {
      initialHeightRef.current = vapi.height;
      handler();
    };

    vapi.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      vapi.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  return state;
}

export function useEditorKeyboardHeight(): string {
  const { isVisible, height } = useVirtualKeyboard();
  const [dynamicHeight, setDynamicHeight] = useState(0);

  useEffect(() => {
    if (isVisible && height > 0) {
      setDynamicHeight(height);
    } else {
      const timer = setTimeout(() => setDynamicHeight(0), 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible, height]);

  return `${dynamicHeight}px`;
}

export function usePreventOverscroll(ref: React.RefObject<HTMLElement | null>) {
  const startY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      const el = ref.current;
      if (!el) return;

      const deltaY = e.touches[0].clientY - startY.current;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        e.preventDefault();
      }
    },
    [ref]
  );

  const element = ref.current;

  useEffect(() => {
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);
}
