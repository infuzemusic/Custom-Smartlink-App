import { NextResponse, type NextRequest } from 'next/server';
import { getProjectByHost, getRelease } from '@/lib/projects';
import { newEventId } from '@/lib/meta';
import { recordEvent } from '@/lib/events';
import { FBP_COOKIE, FBC_COOKIE } from '@/lib/fb';
import { clientIp } from '@/lib/request';

export const dynamic = 'force-dynamic';

/**
 * The click handler, and the only conversion signal this system will ever have:
 * Spotify and the rest are third parties, you cannot pixel them, and they report
 * nothing back.
 *
 * Point your Meta custom conversions at this URL pattern — /out/<release>/<dsp> — or
 * use the DspClick custom event, which carries the release and DSP in custom_data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ release: string; dsp: string }> },
) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const project = await getProjectByHost(host);
  if (!project) return new NextResponse('Not found', { status: 404 });

  const { release: releaseSlug, dsp } = await params;
  const release = await getRelease(project.id, releaseSlug);
  if (!release) return new NextResponse('Not found', { status: 404 });

  // Region-specific destination wins; otherwise the catch-all for this DSP.
  const country = request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry');
  const candidates = release.destinations.filter((d) => d.dsp === dsp);
  const destination =
    candidates.find(
      (d) => d.region !== '*' && country && d.region.toUpperCase() === country.toUpperCase(),
    ) ?? candidates.find((d) => d.region === '*');
  if (!destination) return new NextResponse('Not found', { status: 404 });

  // The browser generated this id and already fired the pixel with it. Matching ids are
  // what stop Meta counting the click twice.
  const eventId = request.nextUrl.searchParams.get('eid') ?? newEventId();

  await recordEvent({
    project,
    releaseId: release.id,
    eventName: 'DspClick',
    eventId,
    eventSourceUrl: request.nextUrl.href,
    dsp,
    fbp: request.cookies.get(FBP_COOKIE)?.value ?? null,
    fbc: request.cookies.get(FBC_COOKIE)?.value ?? null,
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
    referrer: request.headers.get('referer'),
    customData: { content_name: release.slug, content_category: dsp },
  });

  return NextResponse.redirect(destination.url, 302);
}
