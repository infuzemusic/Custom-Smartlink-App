import { ODESLI_PLATFORMS } from './dsp';

/**
 * Resolve one streaming link into every other platform's link, plus title, artist and
 * artwork, via the Odesli (song.link) API.
 *
 * ODESLI_BASE_URL exists so tests can point this at a local stub; ODESLI_API_KEY raises
 * the rate limit if you have a commercial key.
 */
const BASE = process.env.ODESLI_BASE_URL ?? 'https://api.song.link';

export type ResolvedLink = { dsp: string; url: string };

export type Resolved = {
  title: string | null;
  artistName: string | null;
  thumbnailUrl: string | null;
  links: ResolvedLink[];
  pageUrl: string | null;
};

type OdesliResponse = {
  entityUniqueId?: string;
  pageUrl?: string;
  linksByPlatform?: Record<string, { url?: string }>;
  entitiesByUniqueId?: Record<
    string,
    { title?: string; artistName?: string; thumbnailUrl?: string }
  >;
};

export class ResolveError extends Error {}

export async function resolveStreamingUrl(url: string, country = 'US'): Promise<Resolved> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ResolveError('That does not look like a URL.');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ResolveError('Paste an http(s) link to the release on any streaming service.');
  }

  const endpoint = new URL('/v1-alpha.1/links', BASE);
  endpoint.searchParams.set('url', parsed.toString());
  endpoint.searchParams.set('userCountry', country);
  if (process.env.ODESLI_API_KEY) endpoint.searchParams.set('key', process.env.ODESLI_API_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new ResolveError('Could not reach the link resolver. Add the links by hand, or try again.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new ResolveError('The link resolver is rate limiting us. Wait a moment and try again.');
  }
  if (!response.ok) {
    throw new ResolveError(`The link resolver could not find that release (${response.status}).`);
  }

  const body = (await response.json()) as OdesliResponse;
  const links: ResolvedLink[] = [];
  for (const [platform, dsp] of ODESLI_PLATFORMS) {
    const found = body.linksByPlatform?.[platform]?.url;
    if (found) links.push({ dsp, url: found });
  }
  if (links.length === 0) {
    throw new ResolveError('No streaming links came back for that URL.');
  }

  // Prefer the entity the URL actually pointed at; fall back to any entity with metadata.
  const entities = body.entitiesByUniqueId ?? {};
  const entity =
    (body.entityUniqueId ? entities[body.entityUniqueId] : undefined) ??
    Object.values(entities).find((e) => e.title || e.thumbnailUrl);

  return {
    title: entity?.title ?? null,
    artistName: entity?.artistName ?? null,
    thumbnailUrl: entity?.thumbnailUrl ?? null,
    links,
    pageUrl: body.pageUrl ?? null,
  };
}

/** "Midnight Loop (feat. Ayo)" -> "midnight-loop-feat-ayo" */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'release';
}
