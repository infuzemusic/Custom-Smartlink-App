import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { createProject } from './actions';
import { ActionForm } from '@/components/admin/ActionForm';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  if (!(await isSignedIn())) redirect('/admin/login');

  const projects = await sql<
    { id: string; slug: string; name: string; hostname: string | null; releases: number; pixel: string | null }[]
  >`
    select p.id, p.slug, p.name,
           (select hostname from domain d where d.project_id = p.id order by is_primary desc, hostname limit 1) as hostname,
           (select count(*)::int from release r where r.project_id = p.id) as releases,
           t.meta_pixel_id as pixel
    from project p
    left join tracking t on t.project_id = p.id
    order by p.name
  `;

  return (
    <>
      <h1>Projects</h1>
      <p className="lede">Each project serves its own domain, with its own pixel and ad account.</p>

      <div className="card">
        <h2>All projects</h2>
        {projects.length === 0 ? (
          <p className="lede" style={{ margin: 0 }}>No projects yet. Create one below.</p>
        ) : (
          <ul className="rows">
            {projects.map((p) => (
              <li key={p.id}>
                <span className="grow">
                  <a href={`/admin/projects/${p.id}`}>{p.name}</a>
                  <small>{p.hostname ?? 'no domain yet'} · {p.releases} release{p.releases === 1 ? '' : 's'}</small>
                </span>
                <span className={`pill ${p.pixel ? 'ok' : 'warn'}`}>
                  {p.pixel ? 'pixel set' : 'no pixel'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>New project</h2>
        <ActionForm action={createProject} submitLabel="Create project">
          <div className="grid2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="slug">Slug <span className="hint">internal only</span></label>
              <input id="slug" name="slug" type="text" placeholder="alias-one" required />
            </div>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
