import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import sharp from 'sharp';
import { sql } from './db';
import { extractPalette, type Palette } from './palette';

const MAX_BYTES = 8 * 1024 * 1024;

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase();
    return v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
  }
  const [a, b] = address.split('.').map(Number) as [number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Fetch a remote image for storage.
 *
 * The URL comes from the link resolver rather than typed in directly, but it is still a
 * server-side fetch of a third-party address, so private and loopback ranges are refused.
 * ALLOW_LOCAL_FETCH lets the test suite point this at a stub on localhost.
 */
export async function downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const parsed = new URL(url);
  const allowLocal = process.env.ALLOW_LOCAL_FETCH === '1';
  if (!allowLocal && parsed.protocol !== 'https:') {
    throw new Error('Artwork must be served over https.');
  }
  if (!allowLocal) {
    const { address } = await lookup(parsed.hostname);
    if (isPrivateAddress(address)) throw new Error('Refusing to fetch artwork from a private address.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    if (!response.ok) throw new Error(`Artwork download failed (${response.status}).`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) throw new Error('That URL is not an image.');

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error('Artwork is too large.');
    return { bytes, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalise, store and sample the artwork for a release.
 *
 * Stored in Postgres rather than hotlinked, so the page keeps working when the streaming
 * service rotates its CDN URLs — which they do.
 */
export async function importArtwork(releaseId: string, sourceUrl: string): Promise<Palette> {
  const { bytes } = await downloadImage(sourceUrl);

  const normalised = await sharp(bytes)
    .resize(1000, 1000, { fit: 'cover', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(normalised).metadata();
  const palette = await extractPalette(normalised);

  await sql`
    insert into artwork (release_id, content_type, bytes, width, height, source_url)
    values (${releaseId}, 'image/jpeg', ${normalised}, ${meta.width ?? null}, ${meta.height ?? null}, ${sourceUrl})
    on conflict (release_id) do update set
      content_type = excluded.content_type, bytes = excluded.bytes,
      width = excluded.width, height = excluded.height,
      source_url = excluded.source_url, created_at = now()
  `;
  await sql`
    update release set artwork_url = ${`/artwork/${releaseId}`}, palette = ${sql.json(palette)}
    where id = ${releaseId}
  `;
  return palette;
}
