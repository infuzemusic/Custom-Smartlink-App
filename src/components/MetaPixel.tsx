'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
  }
}

/**
 * Loads the project's own pixel and fires PageView with an event id, then asks the
 * server to mirror the same event through the Conversions API using that id. Matching
 * ids are what stop Meta counting the visit twice.
 */
export function MetaPixel({
  pixelId,
  eventId,
  releaseSlug,
}: {
  pixelId: string;
  eventId: string;
  releaseSlug?: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!window.fbq) {
      /* eslint-disable */
      (function (f: any, b: Document, e: string, v: string) {
        if (f.fbq) return;
        const n: any = (f.fbq = function (...args: unknown[]) {
          n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
        });
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        const t = b.createElement(e) as HTMLScriptElement;
        t.async = true;
        t.src = v;
        const s = b.getElementsByTagName(e)[0]!;
        s.parentNode!.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
    }

    window.fbq?.('init', pixelId);
    window.fbq?.('track', 'PageView', {}, { eventID: eventId });

    // Mirror server-side. Fired from the client so page render is never blocked on Meta.
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId, eventName: 'PageView', releaseSlug }),
      keepalive: true,
    }).catch(() => {});
  }, [pixelId, eventId, releaseSlug]);

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: 'none' }}
        alt=""
        src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
      />
    </noscript>
  );
}
