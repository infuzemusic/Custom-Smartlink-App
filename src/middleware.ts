import { NextResponse, type NextRequest } from 'next/server';
import { FBP_COOKIE, FBC_COOKIE, cookieOptions, newFbp, fbcFromFbclid } from '@/lib/fb';

/**
 * Sets Meta's first-party cookies server-side, before anything renders.
 *
 * Deliberately does NO database work: middleware runs on every request including
 * assets, and host -> project resolution belongs in the page and route handlers where
 * an unknown host can return a proper 404.
 */
export function middleware(request: NextRequest) {
  const now = Date.now();
  const setCookies: Array<[string, string]> = [];

  if (!request.cookies.get(FBP_COOKIE)) {
    setCookies.push([FBP_COOKIE, newFbp(now)]);
  }

  // A fresh ad click always wins: it carries the click id this visit should be attributed to.
  const fbclid = request.nextUrl.searchParams.get('fbclid');
  if (fbclid) {
    setCookies.push([FBC_COOKIE, fbcFromFbclid(fbclid, now)]);
  }

  if (setCookies.length === 0) return NextResponse.next();

  // Write to the request too, so this same render sees the cookie on a first visit.
  for (const [name, value] of setCookies) request.cookies.set(name, value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const [name, value] of setCookies) response.cookies.set(name, value, cookieOptions);
  return response;
}

export const config = {
  matcher: ['/((?!admin|api/|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
