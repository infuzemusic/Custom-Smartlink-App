'use client';

import { useState } from 'react';
import { lookupRelease, createReleaseFromLookup, type LookupResult } from '@/app/admin/actions';
import { dspLabel } from '@/lib/dsp';

type Found = Extract<LookupResult, { ok: true }>;

export function ReleaseWizard({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);

  // Editable copies of what came back, so the lookup is a starting point, not a verdict.
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [slug, setSlug] = useState('');
  const [releaseAt, setReleaseAt] = useState('');
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  async function onLookup() {
    setBusy(true);
    setError(null);
    try {
      const result = await lookupRelease(url);
      if (!result.ok) {
        setError(result.error);
        setFound(null);
        return;
      }
      setFound(result);
      setTitle(result.title ?? '');
      setSubtitle(result.artistName ?? '');
      setSlug(result.suggestedSlug);
      setChosen(Object.fromEntries(result.links.map((l) => [l.dsp, true])));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createReleaseFromLookup({
        projectId,
        slug,
        title,
        subtitle: subtitle || null,
        releaseAt: releaseAt || null,
        artworkUrl: found.thumbnailUrl,
        links: found.links.filter((l) => chosen[l.dsp]),
      });
      if (!result.ok) setError(result.error);
      else window.location.href = `/admin/releases/${result.releaseId}`;
    } finally {
      setBusy(false);
    }
  }

  const accent = found?.palette?.accentLight;
  const selectedCount = found ? found.links.filter((l) => chosen[l.dsp]).length : 0;

  return (
    <>
      <div className="card">
        <h2>Paste a streaming link</h2>
        <p className="lede">
          Any platform will do. We look up every other service, import the cover, and take the
          page&apos;s colour from the artwork.
        </p>
        <div className="field">
          <label htmlFor="lookupUrl">Release URL</label>
          <input
            id="lookupUrl"
            type="url"
            value={url}
            placeholder="https://open.spotify.com/album/…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void onLookup(); }
            }}
          />
        </div>
        {error && <p className="err">{error}</p>}
        <p style={{ margin: '14px 0 0' }}>
          <button type="button" onClick={onLookup} disabled={busy || !url}>
            {busy ? 'Looking up…' : 'Look up release'}
          </button>
        </p>
      </div>

      {found && (
        <>
          <div className="card">
            <h2>Found</h2>
            <div className="found">
              {found.thumbnailUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className="found-art" src={found.thumbnailUrl} alt="" />
              )}
              <div className="found-meta">
                <div className="field">
                  <label htmlFor="wTitle">Title</label>
                  <input id="wTitle" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wSubtitle">Subtitle</label>
                  <input id="wSubtitle" type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wSlug">URL slug</label>
                  <input id="wSlug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wReleaseAt">
                    Release date <span className="hint">UTC; leave empty if already out</span>
                  </label>
                  <input
                    id="wReleaseAt" type="datetime-local" value={releaseAt}
                    onChange={(e) => setReleaseAt(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {found.palette && (
              <div className="palette">
                <span className="hint">Page colour from artwork</span>
                <span className="swatches">
                  {found.palette.swatches.map((hex) => (
                    <i key={hex} className="swatch" style={{ background: hex }} title={hex} />
                  ))}
                </span>
                <span className="pill" style={{ color: accent, borderColor: accent }}>
                  {found.palette.accentLight} / {found.palette.accentDark}
                </span>
              </div>
            )}
            {found.paletteNote && <p className="err">{found.paletteNote}</p>}
          </div>

          <div className="card">
            <h2>{selectedCount} of {found.links.length} links</h2>
            <ul className="rows">
              {found.links.map((link) => (
                <li key={link.dsp}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: 0, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={chosen[link.dsp] ?? false}
                      onChange={(e) => setChosen((c) => ({ ...c, [link.dsp]: e.target.checked }))}
                    />
                    <span className="grow">
                      {dspLabel(link.dsp)}
                      <small>{link.url}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error && <p className="err">{error}</p>}
            <p style={{ margin: '16px 0 0' }}>
              <button type="button" onClick={onCreate} disabled={busy || selectedCount === 0}>
                {busy ? 'Creating…' : 'Create release'}
              </button>
            </p>
          </div>
        </>
      )}
    </>
  );
}
