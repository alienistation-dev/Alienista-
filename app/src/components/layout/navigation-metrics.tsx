'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export function NavigationMetrics() {
  const pathname = usePathname();
  const startedAt = useRef<number | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const start = () => {
      startedAt.current = performance.now();
      setPending(true);
      if (process.env.NODE_ENV === 'development') {
        performance.mark('alienista:navigation-start');
        console.debug(`[navigation] start ${pathname}`);
      }
    };
    window.addEventListener('alienista:navigation-start', start);
    return () => window.removeEventListener('alienista:navigation-start', start);
  }, [pathname]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      performance.mark('alienista:content-ready');
      if (startedAt.current !== null) console.debug(`[navigation] content-ready ${pathname} ${(performance.now() - startedAt.current).toFixed(0)}ms`);
    }
    startedAt.current = null;
    const clearTimer = window.setTimeout(() => setPending(false), 0);
    return () => window.clearTimeout(clearTimer);
  }, [pathname]);

  return pending ? <div className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-[#D8EBDD]" role="status" aria-label="Loading page"><div className="h-full w-1/3 animate-[navigation-progress_1s_ease-in-out_infinite] bg-[#2D6A4F]" /></div> : null;
}
