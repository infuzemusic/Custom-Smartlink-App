import { headers } from 'next/headers';
import { getProjectByHost } from './projects';
import type { Project } from './types';

/** The hostname this request arrived on. */
export async function currentHost(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-host') ?? h.get('host') ?? '';
}

/** Resolve the project for this request, or null when the host is not configured. */
export async function currentProject(): Promise<Project | null> {
  return getProjectByHost(await currentHost());
}

/** Best-effort client IP, for Conversions API match quality. */
export function clientIp(h: Headers): string | null {
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip');
}
