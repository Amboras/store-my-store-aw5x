'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Navigation tracker for iframe preview
 *
 * Reports route changes to parent window (admin dashboard) via postMessage.
 * Uses Next.js App Router hooks for reliable navigation detection.
 *
 * MUST be wrapped in Suspense boundary in layout.
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastReportedRef = useRef<string>('');
  const parentOriginRef = useRef<string>('http://localhost:3001');

  useEffect(() => {
    // Only run if inside iframe
    if (window.parent === window) return;

    // Build current route
    const search = searchParams.toString();
    const currentRoute = search ? `${pathname}?${search}` : pathname;

    // Only report if route actually changed
    if (lastReportedRef.current === currentRoute) return;

    lastReportedRef.current = currentRoute;

    // Send navigation update to parent
    window.parent.postMessage(
      {
        type: 'NAVIGATION_CHANGE',
        path: currentRoute,
      },
      parentOriginRef.current,
    );
  }, [pathname, searchParams]);

  // Listen for parent origin from activation message
  useEffect(() => {
    if (window.parent === window) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;

      // Store parent origin when element picker is activated
      if (event.data.type === 'ACTIVATE_ELEMENT_PICKER' && event.data.parentOrigin) {
        parentOriginRef.current = event.data.parentOrigin;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return null;
}
