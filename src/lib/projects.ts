import { cache } from 'react';
import { sql } from './db';
import type { Project, Release, Destination } from './types';

/** Strip port and lowercase, so localhost:3000 and example.com:443 both resolve. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').split(':')[0]!.trim().toLowerCase();
}

/**
 * Resolve a hostname to a project.
 *
 * There is deliberately NO fallback to a default project. A misconfigured domain
 * silently resolving to the wrong project would fire one alias's events into another
 * alias's pixel — the one failure here that corrupts data you cannot clean up
 * afterwards. An unknown host is a 404.
 */
export const getProjectByHost = cache(async (host: string): Promise<Project | null> => {
  const hostname = normalizeHost(host);
  if (!hostname) return null;

  const rows = await sql<
    {
      id: string; slug: string; name: string; tagline: string | null;
      theme: Project['theme']; profiles: Project['profiles'];
      meta_pixel_id: string | null; capi_token_ref: string | null;
      test_event_code_ref: string | null;
    }[]
  >`
    select p.id, p.slug, p.name, p.tagline, p.theme, p.profiles,
           t.meta_pixel_id, t.capi_token_ref, t.test_event_code_ref
    from domain d
    join project p on p.id = d.project_id
    left join tracking t on t.project_id = p.id
    where d.hostname = ${hostname}
    limit 1
  `;

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline,
    theme: r.theme ?? {}, profiles: r.profiles ?? {},
    metaPixelId: r.meta_pixel_id, capiTokenRef: r.capi_token_ref,
    testEventCodeRef: r.test_event_code_ref,
  };
});

export const getRelease = cache(
  async (projectId: string, slug: string): Promise<Release | null> => {
    const rows = await sql<
      {
        id: string; slug: string; title: string; subtitle: string | null;
        artwork_url: string | null; release_at: Date | null;
      }[]
    >`
      select id, slug, title, subtitle, artwork_url, release_at
      from release
      where project_id = ${projectId} and slug = ${slug} and is_published
      limit 1
    `;
    const r = rows[0];
    if (!r) return null;

    const destinations = await sql<
      { id: string; dsp: string; url: string; region: string; sort_order: number }[]
    >`
      select id, dsp, url, region, sort_order
      from destination where release_id = ${r.id}
      order by sort_order asc, dsp asc
    `;

    return {
      id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle,
      artworkUrl: r.artwork_url, releaseAt: r.release_at,
      destinations: destinations.map<Destination>((d) => ({
        id: d.id, dsp: d.dsp, url: d.url, region: d.region, sortOrder: d.sort_order,
      })),
    };
  },
);

export const listReleases = cache(async (projectId: string) => {
  return sql<
    { slug: string; title: string; subtitle: string | null; artwork_url: string | null; release_at: Date | null }[]
  >`
    select slug, title, subtitle, artwork_url, release_at
    from release
    where project_id = ${projectId} and is_published
    order by coalesce(release_at, created_at) desc
  `;
});
