import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness in one. Checks the database, because a deployment that boots
 * but cannot reach Postgres serves 500s on every page — which is not "up".
 *
 * Deliberately outside the host-to-project resolution, so it answers on any hostname,
 * including whatever internal address the platform's health checker uses.
 */
export async function GET() {
  try {
    const [row] = await sql<{ projects: number }[]>`select count(*)::int as projects from project`;
    return NextResponse.json(
      { ok: true, projects: row?.projects ?? 0 },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    console.error('[healthz] database unreachable', err);
    return NextResponse.json(
      { ok: false, error: 'database unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
