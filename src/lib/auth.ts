import { cookies, headers } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeHost } from './projects';

export { hashPassword, verifyPassword } from './password';

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Where the admin is reachable.
 *
 * Set ADMIN_HOST to a host that is NOT one of your project domains, so the admin is
 * never served from a page you run ads to. With it unset the admin is available only in
 * development — meaning a production deploy that forgets to configure it has no admin at
 * all, rather than an unprotected one.
 */
export async function adminHostAllowed(): Promise<boolean> {
  const configured = normalizeHost(process.env.ADMIN_HOST);
  if (!configured) return process.env.NODE_ENV !== 'production';
  const h = await headers();
  const host = normalizeHost(h.get('x-forwarded-host') ?? h.get('host'));
  return host === configured;
}

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export async function createSession(): Promise<void> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, `${expiry}.${sign(expiry)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: SESSION_COOKIE, path: '/admin' });
}

export async function isSignedIn(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.SESSION_SECRET) return false;
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const [expiry, signature] = raw.split('.');
  if (!expiry || !signature) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = Buffer.from(sign(expiry), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** Throws unless this request is an authenticated admin on the admin host. */
export async function requireAdmin(): Promise<void> {
  if (!(await adminHostAllowed())) throw new Error('Admin is not available on this host');
  if (!(await isSignedIn())) throw new Error('Not signed in');
}
