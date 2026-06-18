import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'wikicollab-install-dismissed';
const INSTALLED_KEY = 'wikicollab-installed';

function safeGetBoolean(key: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  const ua = nav.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isIpadOsDesktopUa = nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
  const isWebKit = /WebKit/.test(ua);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS/.test(ua);
  return (isIos || isIpadOsDesktopUa) && isWebKit && !isOtherBrowser;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => safeGetBoolean(INSTALLED_KEY));
  const [isDismissed, setIsDismissed] = useState(() => safeGetBoolean(DISMISSED_KEY));
  const [isManualInstall, setIsManualInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      safeSetItem(INSTALLED_KEY, 'true');
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    const isStandalone =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      setIsInstalled(true);
    } else if (isIosSafari()) {
      setIsInstallable(true);
      setIsManualInstall(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsInstallable(false);
    if (outcome === 'accepted') {
      setIsInstalled(true);
      safeSetItem(INSTALLED_KEY, 'true');
    }
    return outcome === 'accepted';
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    setIsInstallable(false);
    safeSetItem(DISMISSED_KEY, 'true');
  }, []);

  const shouldShowBanner = isInstallable && !isInstalled && !isDismissed;

  return {
    isInstallable,
    isInstalled,
    isDismissed,
    isManualInstall,
    shouldShowBanner,
    promptInstall,
    dismiss,
  };
}
