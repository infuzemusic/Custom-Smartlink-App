/**
 * First-party Meta cookies, set by US at the edge rather than by the pixel's JavaScript.
 *
 * Why this matters: Safari's ITP caps cookies written by document.cookie at 7 days.
 * Cookies delivered in a Set-Cookie response header from the site's own origin are not
 * subject to that cap, so click attribution survives well past a week. This only works
 * because each project runs on a domain you own — it is the concrete payoff of the
 * artist-owned-domain architecture.
 *
 * NOTE: httpOnly is deliberately FALSE. The Meta pixel reads _fbp from document.cookie;
 * if it cannot see ours it invents its own value, and the browser event and the server
 * event would then carry different fbp values and stop matching.
 */

export const FBP_COOKIE = '_fbp';
export const FBC_COOKIE = '_fbc';
export const COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // Meta's own window for these cookies

/** Meta's format: fb.<subdomainIndex>.<creationTimeMs>.<value>. Index 1 = set on eTLD+1. */
const SUBDOMAIN_INDEX = 1;

export function newFbp(now = Date.now()): string {
  const random = Math.floor(Math.random() * 1e10);
  return `fb.${SUBDOMAIN_INDEX}.${now}.${random}`;
}

export function fbcFromFbclid(fbclid: string, now = Date.now()): string {
  return `fb.${SUBDOMAIN_INDEX}.${now}.${fbclid}`;
}

export const cookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_MAX_AGE,
};
