import { NextResponse, type NextRequest } from 'next/server';
import { getProjectByHost, getRelease } from '@/lib/projects';
import { recordEvent } from '@/lib/events';
import { FBP_COOKIE, FBC_COOKIE } from '@/lib/fb';
import { clientIp } from '@/lib/request';

export const dynamic = 'force-dynamic';

/**
 * Server-side mirror of the browser PageView.
 *
 * Called from the client rather than fired during render, so the page never waits on
 * Meta to respond before it paints.
 */
export async function POST(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const project = await getProjectByHost(host);
  if (!project) return new NextResponse(null, { status: 404 });

  let body: { eventId?: string; eventName?: string; releaseSlug?: string };
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Only the events this endpoint is meant to mirror, so a stray caller can't inject
  // arbitrary event names into the project's dataset.
  if (!body.eventId || body.eventName !== 'PageView') {
    return new NextResponse(null, { status: 400 });
  }

  const release = body.releaseSlug ? await getRelease(project.id, body.releaseSlug) : null;
  const referrer = request.headers.get('referer');

  await recordEvent({
    project,
    releaseId: release?.id ?? null,
    eventName: 'PageView',
    eventId: body.eventId,
    eventSourceUrl: referrer ?? `https://${host}/`,
    fbp: request.cookies.get(FBP_COOKIE)?.value ?? null,
    fbc: request.cookies.get(FBC_COOKIE)?.value ?? null,
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
    referrer,
    customData: release ? { content_name: release.slug } : undefined,
  });

  return new NextResponse(null, { status: 204 });
}
