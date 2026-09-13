import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { currentProject } from '@/lib/request';
import { listReleases } from '@/lib/projects';
import { newEventId } from '@/lib/meta';
import { MetaPixel } from '@/components/MetaPixel';

export async function generateMetadata(): Promise<Metadata> {
  const project = await currentProject();
  if (!project) return { title: 'Not found' };
  return {
    title: project.name,
    description: project.tagline ?? undefined,
    openGraph: { title: project.name, description: project.tagline ?? undefined, type: 'website' },
  };
}

/** Hub page: the project's releases at the root of its own domain. */
export default async function HubPage() {
  const project = await currentProject();
  if (!project) notFound();

  const releases = await listReleases(project.id);
  const eventId = newEventId();
  const accent = project.theme.accent;

  return (
    <main className="page" style={accent ? ({ ['--accent' as string]: accent } as React.CSSProperties) : undefined}>
      {project.metaPixelId && <MetaPixel pixelId={project.metaPixelId} eventId={eventId} />}

      <div className="head">
        <div className="meta">
          <h1>{project.name}</h1>
          {project.tagline && <p className="subtitle">{project.tagline}</p>}
        </div>
      </div>

      <section className="section">
        <h2>Releases</h2>
        {releases.length === 0 ? (
          <p className="subtitle">Nothing published yet.</p>
        ) : (
          <ul className="releases">
            {releases.map((r) => (
              <li key={r.slug}>
                <a className="release-row" href={`/${r.slug}`}>
                  {r.artwork_url && <img src={r.artwork_url} alt="" />}
                  <span>
                    <strong>{r.title}</strong>
                    {r.subtitle && <span>{r.subtitle}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {Object.keys(project.profiles).length > 0 && (
        <section className="section">
          <h2>Elsewhere</h2>
          <div className="profiles">
            {Object.entries(project.profiles).map(([name, url]) => (
              <a key={name} href={url} rel="me noopener">
                {name}
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
