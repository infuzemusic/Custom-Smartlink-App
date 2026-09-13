'use client';

import type { Destination } from '@/lib/types';

const LABELS: Record<string, string> = {
  spotify: 'Spotify',
  'apple-music': 'Apple Music',
  'youtube-music': 'YouTube Music',
  youtube: 'YouTube',
  deezer: 'Deezer',
  tidal: 'Tidal',
  amazon: 'Amazon Music',
  bandcamp: 'Bandcamp',
  soundcloud: 'SoundCloud',
  beatport: 'Beatport',
};

const label = (dsp: string) =>
  LABELS[dsp] ?? dsp.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Every link is a real <a> to /out/..., so it works without JavaScript and can be
 * opened in a new tab. With JavaScript we generate the event id up front, fire the
 * browser pixel with it, and hand the same id to the server through the URL.
 *
 * This click is the only conversion signal that exists: Spotify is a third party, you
 * cannot put a pixel on it, and it reports nothing back.
 */
export function DspButtons({
  releaseSlug,
  destinations,
  ctaVerb,
}: {
  releaseSlug: string;
  destinations: Destination[];
  ctaVerb: string;
}) {
  function onClick(dsp: string) {
    return (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Let modified clicks (new tab, download) behave normally.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      const eventId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now());
      window.fbq?.(
        'trackCustom',
        'DspClick',
        { content_name: releaseSlug, content_category: dsp },
        { eventID: eventId },
      );
      window.location.href = `/out/${encodeURIComponent(releaseSlug)}/${encodeURIComponent(dsp)}?eid=${eventId}`;
    };
  }

  return (
    <ul className="dsp-list">
      {destinations.map((d) => (
        <li key={d.id}>
          <a
            className="dsp"
            href={`/out/${encodeURIComponent(releaseSlug)}/${encodeURIComponent(d.dsp)}`}
            onClick={onClick(d.dsp)}
          >
            <span className="dsp-name">{label(d.dsp)}</span>
            <span className="dsp-cta">{ctaVerb}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
