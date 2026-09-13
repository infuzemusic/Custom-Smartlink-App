import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { updateRelease, deleteRelease, saveDestination, deleteDestination, reimportArtwork } from '../../actions';
import { ActionForm } from '@/components/admin/ActionForm';
import { ConfirmButton } from '@/components/admin/Confirm';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

/** <input type="datetime-local"> wants local-ish "YYYY-MM-DDTHH:mm". */
function forInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16) : '';
}

export default async function ReleasePage({ params }: Props) {
  if (!(await isSignedIn())) redirect('/admin/login');
  const { id } = await params;

  const [release] = await sql<
    {
      id: string; project_id: string; slug: string; title: string; subtitle: string | null;
      artwork_url: string | null; isrc: string | null; upc: string | null;
      release_at: Date | null; is_published: boolean;
      palette: { accentLight: string; accentDark: string; swatches: string[] } | null;
      project_name: string; hostname: string | null;
    }[]
  >`
    select r.*, p.name as project_name,
           (select hostname from domain d where d.project_id = p.id order by is_primary desc, hostname limit 1) as hostname
    from release r join project p on p.id = r.project_id
    where r.id = ${id}
  `;
  if (!release) notFound();

  const destinations = await sql<
    { id: string; dsp: string; url: string; region: string; sort_order: number; clicks: number }[]
  >`
    select d.id, d.dsp, d.url, d.region, d.sort_order,
           (select count(*)::int from event e
             where e.release_id = ${id} and e.dsp = d.dsp and not e.is_bot
               and e.created_at > now() - interval '30 days') as clicks
    from destination d where d.release_id = ${id}
    order by d.sort_order, d.dsp
  `;

  return (
    <>
      <h1>{release.title}</h1>
      <p className="lede">
        <a href={`/admin/projects/${release.project_id}`}>{release.project_name}</a>
        {release.hostname && (
          <>
            {' · '}
            <a href={`https://${release.hostname}/${release.slug}`} rel="noopener">
              {release.hostname}/{release.slug}
            </a>
          </>
        )}
      </p>

      <div className="card">
        <h2>Release</h2>
        <ActionForm action={updateRelease} submitLabel="Save release">
          <input type="hidden" name="id" value={release.id} />
          <div className="grid2">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" defaultValue={release.title} required />
            </div>
            <div className="field">
              <label htmlFor="subtitle">Subtitle <span className="hint">artist or feature credit</span></label>
              <input id="subtitle" name="subtitle" type="text" defaultValue={release.subtitle ?? ''} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="artworkUrl">Artwork URL</label>
            <input id="artworkUrl" name="artworkUrl" type="url" defaultValue={release.artwork_url ?? ''} />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="isrc">ISRC <span className="hint">the key every DSP agrees on</span></label>
              <input id="isrc" name="isrc" type="text" defaultValue={release.isrc ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="upc">UPC</label>
              <input id="upc" name="upc" type="text" defaultValue={release.upc ?? ''} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="releaseAt">
              Release date and time <span className="hint">UTC; leave empty if already out</span>
            </label>
            <input id="releaseAt" name="releaseAt" type="datetime-local" defaultValue={forInput(release.release_at)} />
          </div>
          <div className="field">
            <label htmlFor="isPublished" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input id="isPublished" name="isPublished" type="checkbox" defaultChecked={release.is_published} />
              Published <span className="hint">unpublished releases 404 on the public site</span>
            </label>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Destinations</h2>
        <p className="lede">
          Clicks here are the only conversion signal that exists — the DSPs report nothing back.
          Point your Meta custom conversions at <code>/out/{release.slug}/&lt;dsp&gt;</code>.
        </p>
        {destinations.length > 0 && (
          <ul className="rows">
            {destinations.map((d) => (
              <li key={d.id}>
                <span className="grow">
                  {d.dsp}
                  <small>{d.url}</small>
                </span>
                {d.region !== '*' && <span className="pill">{d.region}</span>}
                <span className="pill">{d.clicks} clicks / 30d</span>
                <form action={deleteDestination}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="releaseId" value={release.id} />
                  <ConfirmButton message={`Remove the ${d.dsp} link?`} label="Remove" />
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={saveDestination} submitLabel="Save destination">
          <input type="hidden" name="releaseId" value={release.id} />
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="dsp">DSP <span className="hint">spotify, apple-music, …</span></label>
              <input id="dsp" name="dsp" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="region">Region <span className="hint">* for all, or a country code</span></label>
              <input id="region" name="region" type="text" defaultValue="*" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="url">URL</label>
            <input id="url" name="url" type="url" placeholder="https://open.spotify.com/..." required />
          </div>
          <div className="field">
            <label htmlFor="sortOrder">Order</label>
            <input id="sortOrder" name="sortOrder" type="number" defaultValue={destinations.length + 1} />
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Artwork</h2>
        <p className="lede">
          Importing stores the image here and re-samples the page colour from it, so the page
          keeps working when the streaming service rotates its CDN URLs.
        </p>
        {release.palette && (
          <div className="palette" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            <span className="swatches">
              {release.palette.swatches.map((hex: string) => (
                <i key={hex} className="swatch" style={{ background: hex }} title={hex} />
              ))}
            </span>
            <span className="pill">light {release.palette.accentLight}</span>
            <span className="pill">dark {release.palette.accentDark}</span>
          </div>
        )}
        <ActionForm action={reimportArtwork} submitLabel="Import artwork">
          <input type="hidden" name="releaseId" value={release.id} />
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="sourceUrl">Image URL</label>
            <input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://…/cover.jpg" required />
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Danger zone</h2>
        <form action={deleteRelease}>
          <input type="hidden" name="id" value={release.id} />
          <input type="hidden" name="projectId" value={release.project_id} />
          <ConfirmButton message={`Delete "${release.title}" and its links?`} label="Delete this release" />
        </form>
      </div>
    </>
  );
}
