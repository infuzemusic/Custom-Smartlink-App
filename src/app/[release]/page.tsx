import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { currentProject } from '@/lib/request';
import { getRelease } from '@/lib/projects';
import { isLive } from '@/lib/types';
import { newEventId } from '@/lib/meta';
import { isHexColour } from '@/lib/palette';
import { MetaPixel } from '@/components/MetaPixel';
import { DspButtons } from '@/components/DspButtons';

type Props = { params: Promise<{ release: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await currentProject();
  if (!project) return { title: 'Not found' };
  const { release: slug } = await params;
  const release = await getRelease(project.id, slug);
  if (!release) return { title: 'Not found' };

  const title = `${release.title} — ${project.name}`;
  return {
    title,
    description: release.subtitle ?? `Listen to ${release.title} by ${project.name}.`,
    openGraph: {
      title,
      description: release.subtitle ?? undefined,
      images: release.artworkUrl ? [release.artworkUrl] : undefined,
      type: 'music.song',
    },
    twitter: { card: 'summary_large_image' },
  };
}

/**
 * The smart link page.
 *
 * Deliberately does NOT auto-redirect. A bare bridge page that bounces straight to a
 * DSP is exactly the post-click pattern Meta's landing-page quality scoring penalises,
 * and giving the visitor a real page costs nothing when you control it.
 */
export default async function ReleasePage({ params }: Props) {
  const project = await currentProject();
  if (!project) notFound();

  const { release: slug } = await params;
  const release = await getRelease(project.id, slug);
  if (!release) notFound();

  const live = isLive(release);
  const eventId = newEventId();

  /**
   * Colour the page from the artwork when we sampled it, otherwise from the project.
   *
   * Emitted as a scoped <style> rather than an inline style because the accent differs
   * between light and dark — an inline style cannot carry a media query. Both values are
   * validated as hex first, since they land inside a stylesheet.
   */
  const palette = release.palette;
  const accentLight = isHexColour(palette?.accentLight) ? palette!.accentLight : project.theme.accent;
  const accentDark = isHexColour(palette?.accentDark) ? palette!.accentDark : project.theme.accent;
  const scope = `r${release.id.replace(/-/g, '')}`;
  const css = [
    isHexColour(accentLight) ? `.${scope}{--accent:${accentLight}}` : '',
    isHexColour(accentDark)
      ? `@media (prefers-color-scheme:dark){.${scope}{--accent:${accentDark}}}`
      : '',
  ].join('');

  return (
    <main className={`page ${scope}`}>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {project.metaPixelId && (
        <MetaPixel pixelId={project.metaPixelId} eventId={eventId} releaseSlug={release.slug} />
      )}

      <div className="head">
        {release.artworkUrl && (
          <img className="artwork" src={release.artworkUrl} alt={`${release.title} artwork`} />
        )}
        <div className="meta">
          <p className="eyebrow">
            {live
              ? 'Out now'
              : release.releaseAt
                ? `Out ${release.releaseAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : 'Coming soon'}
          </p>
          <h1>{release.title}</h1>
          <p className="subtitle">{release.subtitle ?? project.name}</p>
        </div>
      </div>

      {release.destinations.length > 0 ? (
        <DspButtons
          releaseSlug={release.slug}
          destinations={release.destinations}
          ctaVerb={live ? 'Play' : 'Pre-save'}
        />
      ) : (
        <p className="subtitle" style={{ marginTop: 28 }}>
          Links going live shortly.
        </p>
      )}

      <section className="section">
        <h2>{project.name}</h2>
        <div className="profiles">
          <a href="/">All releases</a>
          {Object.entries(project.profiles).map(([name, url]) => (
            <a key={name} href={url} rel="me noopener">
              {name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
