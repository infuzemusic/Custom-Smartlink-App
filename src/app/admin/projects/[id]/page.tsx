import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  updateProject, deleteProject, addDomain, deleteDomain, makeDomainPrimary,
  updateTracking, createRelease,
} from '../../actions';
import { ActionForm } from '@/components/admin/ActionForm';
import { ConfirmButton } from '@/components/admin/Confirm';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  if (!(await isSignedIn())) redirect('/admin/login');
  const { id } = await params;

  const [project] = await sql<
    {
      id: string; slug: string; name: string; tagline: string | null;
      theme: { accent?: string }; profiles: Record<string, string>;
      meta_pixel_id: string | null; meta_ad_account_id: string | null;
      capi_token_ref: string | null; test_event_code_ref: string | null;
    }[]
  >`
    select p.id, p.slug, p.name, p.tagline, p.theme, p.profiles,
           t.meta_pixel_id, t.meta_ad_account_id, t.capi_token_ref, t.test_event_code_ref
    from project p left join tracking t on t.project_id = p.id
    where p.id = ${id}
  `;
  if (!project) notFound();

  const domains = await sql<{ id: string; hostname: string; is_primary: boolean }[]>`
    select id, hostname, is_primary from domain where project_id = ${id}
    order by is_primary desc, hostname
  `;
  const releases = await sql<
    { id: string; slug: string; title: string; release_at: Date | null; is_published: boolean; destinations: number }[]
  >`
    select r.id, r.slug, r.title, r.release_at, r.is_published,
           (select count(*)::int from destination d where d.release_id = r.id) as destinations
    from release r where r.project_id = ${id}
    order by coalesce(r.release_at, r.created_at) desc
  `;
  const [stats] = await sql<
    { views: number; clicks: number; bots: number; capi_failed: number }[]
  >`
    select
      count(*) filter (where event_name = 'PageView' and not is_bot)::int as views,
      count(*) filter (where event_name = 'DspClick' and not is_bot)::int as clicks,
      count(*) filter (where is_bot)::int as bots,
      count(*) filter (where capi_status = 'failed')::int as capi_failed
    from event
    where project_id = ${id} and created_at > now() - interval '30 days'
  `;

  // Whether the env var named in the database actually exists in this deployment.
  const tokenPresent = project.capi_token_ref ? Boolean(process.env[project.capi_token_ref]) : false;
  const primary = domains.find((d) => d.is_primary) ?? domains[0];
  const profilesText = Object.entries(project.profiles ?? {})
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');

  return (
    <>
      <h1>{project.name}</h1>
      <p className="lede">
        {primary ? (
          <a href={`https://${primary.hostname}`} rel="noopener">{primary.hostname}</a>
        ) : (
          'No domain connected yet.'
        )}
      </p>

      <div className="card">
        <h2>Last 30 days</h2>
        <div className="stats">
          <span className="stat"><strong>{stats?.views ?? 0}</strong><span>Page views</span></span>
          <span className="stat"><strong>{stats?.clicks ?? 0}</strong><span>DSP clicks</span></span>
          <span className="stat"><strong>{stats?.bots ?? 0}</strong><span>Bots filtered</span></span>
          <span className="stat"><strong>{stats?.capi_failed ?? 0}</strong><span>CAPI failures</span></span>
        </div>
      </div>

      <div className="card">
        <h2>Details</h2>
        <ActionForm action={updateProject} submitLabel="Save details">
          <input type="hidden" name="id" value={project.id} />
          <div className="grid2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" defaultValue={project.name} required />
            </div>
            <div className="field">
              <label htmlFor="accent">Accent colour</label>
              <input id="accent" name="accent" type="text" placeholder="#0e5c52" defaultValue={project.theme?.accent ?? ''} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="tagline">Tagline</label>
            <input id="tagline" name="tagline" type="text" defaultValue={project.tagline ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="profiles">Profile links <span className="hint">one per line, Label = URL</span></label>
            <textarea id="profiles" name="profiles" defaultValue={profilesText} />
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Domains</h2>
        <p className="lede">
          Each project needs its own root domain, verified in your Business Portfolio. An unknown
          host returns 404 rather than falling back, so events can never land in the wrong pixel.
        </p>
        {domains.length > 0 && (
          <ul className="rows">
            {domains.map((d) => (
              <li key={d.id}>
                <span className="grow">{d.hostname}</span>
                {d.is_primary ? (
                  <span className="pill ok">primary</span>
                ) : (
                  <form action={makeDomainPrimary}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button className="ghost" type="submit" style={{ padding: '4px 10px', fontSize: 13 }}>
                      Make primary
                    </button>
                  </form>
                )}
                <form action={deleteDomain}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <ConfirmButton message={`Remove ${d.hostname}?`} label="Remove" />
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addDomain} submitLabel="Add domain">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="hostname">Hostname</label>
            <input id="hostname" name="hostname" type="text" placeholder="yourdomain.com" required />
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Tracking</h2>
        <p className="lede">
          This project&apos;s own pixel and ad account. The token field takes the <em>name</em> of an
          environment variable, never the token itself.
        </p>
        <ActionForm action={updateTracking} submitLabel="Save tracking">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid2">
            <div className="field">
              <label htmlFor="metaPixelId">Meta pixel ID</label>
              <input id="metaPixelId" name="metaPixelId" type="text" defaultValue={project.meta_pixel_id ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="metaAdAccountId">Ad account ID</label>
              <input id="metaAdAccountId" name="metaAdAccountId" type="text" placeholder="act_..." defaultValue={project.meta_ad_account_id ?? ''} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="capiTokenRef">
              CAPI token env var name{' '}
              {project.capi_token_ref && (
                <span className={`pill ${tokenPresent ? 'ok' : 'warn'}`}>
                  {tokenPresent ? 'set in this environment' : 'missing in this environment'}
                </span>
              )}
            </label>
            <input id="capiTokenRef" name="capiTokenRef" type="text" placeholder="META_CAPI_TOKEN_ALIAS_ONE" defaultValue={project.capi_token_ref ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="testEventCodeRef">Test event code env var name <span className="hint">optional, for Events Manager testing</span></label>
            <input id="testEventCodeRef" name="testEventCodeRef" type="text" defaultValue={project.test_event_code_ref ?? ''} />
          </div>
        </ActionForm>
      </div>

      <div className="card">
        <h2>Releases</h2>
        {releases.length > 0 && (
          <ul className="rows">
            {releases.map((r) => (
              <li key={r.id}>
                <span className="grow">
                  <a href={`/admin/releases/${r.id}`}>{r.title}</a>
                  <small>
                    /{r.slug} · {r.destinations} link{r.destinations === 1 ? '' : 's'}
                    {r.release_at ? ` · ${r.release_at.toISOString().slice(0, 10)}` : ''}
                  </small>
                </span>
                {!r.is_published && <span className="pill">draft</span>}
              </li>
            ))}
          </ul>
        )}
        <p style={{ margin: '16px 0 6px' }}>
          <a
            href={`/admin/projects/${project.id}/new`}
            style={{ fontWeight: 600, color: 'var(--accent)' }}
          >
            Create from a streaming link &rarr;
          </a>{' '}
          <span className="hint">finds every other service, imports the cover, sets the colour</span>
        </p>
        <details style={{ marginTop: 10 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>Or add one by hand</summary>
        <ActionForm action={createRelease} submitLabel="Add release">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid2" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="slug">URL slug</label>
              <input id="slug" name="slug" type="text" placeholder="first-release" required />
            </div>
          </div>
        </ActionForm>
        </details>
      </div>

      <div className="card">
        <h2>Danger zone</h2>
        <form action={deleteProject}>
          <input type="hidden" name="id" value={project.id} />
          <ConfirmButton
            message={`Delete "${project.name}" and all of its releases, domains and events? This cannot be undone.`}
            label="Delete this project"
          />
        </form>
      </div>
    </>
  );
}
