import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Serves artwork stored alongside the release. Immutable: a re-import changes the URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });

  const [row] = await sql<{ bytes: Buffer; content_type: string; created_at: Date }[]>`
    select bytes, content_type, created_at from artwork where release_id = ${id}
  `;
  if (!row) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      'content-type': row.content_type,
      'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
      etag: `"${row.created_at.getTime()}"`,
    },
  });
}
