'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const e = event as BeforeInstallPromptEvent;
      e.preventDefault();
      deferredPrompt.current = e;
      
      const isDismissed = sessionStorage.getItem('pwa_install_dismissed');
      if (!isDismissed) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      deferredPrompt.current = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!showPrompt) return null;

  const install = async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) return;
    
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setShowPrompt(false);
    }
  };

  const dismiss = () => {
    sessionStorage.setItem('pwa_install_dismissed', 'true');
    setShowPrompt(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-sm z-[60] bg-white border border-[#C2E0CC] rounded-2xl shadow-xl p-3 flex items-center gap-3" role="dialog" aria-label="Install Alienista">
      <Download className="w-5 h-5 text-[#2D6A4F] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">Install Alienista</p>
        <p className="text-xs text-slate-500">Add a faster shortcut to this device.</p>
      </div>
      <button type="button" onClick={() => void install()} className="px-3 py-2 rounded-lg bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#1B4332]">Install</button>
      <button type="button" onClick={dismiss} title="Dismiss install prompt" aria-label="Dismiss install prompt" className="p-1.5 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
    </div>
  );
}
