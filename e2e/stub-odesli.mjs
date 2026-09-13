/**
 * Stands in for api.song.link and a cover-art CDN during tests.
 *
 * Point the app at it with ODESLI_BASE_URL=http://127.0.0.1:4010 and
 * ALLOW_LOCAL_FETCH=1. The response shape mirrors Odesli's v1-alpha.1 /links payload.
 */
import { createServer } from 'node:http';
import sharp from 'sharp';

const PORT = Number(process.env.STUB_PORT ?? 4010);
const ORIGIN = `http://127.0.0.1:${PORT}`;

// A cover whose obvious colour is a deep magenta, over near-black and near-white areas
// that a naive "most common colour" sampler would pick instead.
const cover = await sharp({
  create: { width: 600, height: 600, channels: 3, background: '#111014' },
})
  .composite([
    {
      input: await sharp({ create: { width: 600, height: 210, channels: 3, background: '#f4f2ef' } })
        .png().toBuffer(),
      top: 0, left: 0,
    },
    {
      input: await sharp({ create: { width: 320, height: 320, channels: 3, background: '#c0267a' } })
        .png().toBuffer(),
      top: 190, left: 140,
    },
  ])
  .jpeg()
  .toBuffer();

const payload = {
  entityUniqueId: 'SPOTIFY_ALBUM::4aTestAlbumId',
  userCountry: 'US',
  pageUrl: 'https://song.link/s/4aTestAlbumId',
  linksByPlatform: {
    spotify: { url: 'https://open.spotify.com/album/4aTestAlbumId', entityUniqueId: 'SPOTIFY_ALBUM::4aTestAlbumId' },
    appleMusic: { url: 'https://music.apple.com/us/album/1234567890' },
    youtubeMusic: { url: 'https://music.youtube.com/playlist?list=OLAK5uy_test' },
    youtube: { url: 'https://www.youtube.com/playlist?list=OLAK5uy_test' },
    deezer: { url: 'https://www.deezer.com/album/123456' },
    tidal: { url: 'https://listen.tidal.com/album/123456' },
    amazonMusic: { url: 'https://music.amazon.com/albums/B0TEST' },
    soundcloud: { url: 'https://soundcloud.com/nightdrive/sets/violet-hour' },
  },
  entitiesByUniqueId: {
    'SPOTIFY_ALBUM::4aTestAlbumId': {
      id: '4aTestAlbumId',
      type: 'album',
      title: 'The Violet Hour (Deluxe)',
      artistName: 'Nightdrive',
      thumbnailUrl: `${ORIGIN}/cover.jpg`,
      thumbnailWidth: 600,
      thumbnailHeight: 600,
      apiProvider: 'spotify',
      platforms: ['spotify'],
    },
  },
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  if (url.pathname === '/cover.jpg') {
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': cover.length });
    res.end(cover);
    return;
  }
  if (url.pathname === '/v1-alpha.1/links') {
    if (!url.searchParams.get('url')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"statusCode":400}');
      return;
    }
    if (url.searchParams.get('url').includes('unknown')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"statusCode":404}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`stub-odesli on ${ORIGIN}`));
