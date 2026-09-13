/**
 * Example seed — edit the PROJECTS block below for your own projects, then:
 *   npm run db:migrate && npm run db:seed
 *
 * Safe to re-run: everything upserts on its natural key.
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { onnotice: () => {} });

const ACCOUNT = { name: 'Owner', email: process.env.SEED_ACCOUNT_EMAIL ?? null };

const PROJECTS = [
  {
    slug: 'nightdrive',
    name: 'Nightdrive',
    tagline: 'Synth-leaning club records out of Manchester',
    theme: { accent: '#e0653a' },
    profiles: {
      Spotify: 'https://open.spotify.com/',
      Bandcamp: 'https://bandcamp.com/',
      Instagram: 'https://instagram.com/',
    },
    // Add 'localhost' so the project resolves in development.
    hosts: ['nightdrive.test', 'www.nightdrive.test', 'localhost'],
    tracking: {
      meta_pixel_id: null as string | null,
      meta_ad_account_id: null as string | null,
      capi_token_ref: 'META_CAPI_TOKEN_NIGHTDRIVE',
      test_event_code_ref: 'META_TEST_EVENT_CODE_NIGHTDRIVE',
    },
    releases: [
      {
        slug: 'midnight-loop',
        title: 'Midnight Loop',
        subtitle: 'Nightdrive',
        artwork_url: '/demo/nightdrive.svg' as string | null,
        isrc: 'GBKQU2412345' as string | null,
        release_at: null as string | null, // already out
        destinations: [
          { dsp: 'spotify', url: 'https://open.spotify.com/', sort_order: 1 },
          { dsp: 'apple-music', url: 'https://music.apple.com/', sort_order: 2 },
          { dsp: 'youtube-music', url: 'https://music.youtube.com/', sort_order: 3 },
          { dsp: 'bandcamp', url: 'https://bandcamp.com/', sort_order: 4 },
          { dsp: 'soundcloud', url: 'https://soundcloud.com/', sort_order: 5 },
        ],
      },
      {
        slug: 'static-bloom',
        title: 'Static Bloom',
        subtitle: 'Nightdrive feat. Ayo',
        artwork_url: '/demo/nightdrive.svg' as string | null,
        isrc: 'GBKQU2498765' as string | null,
        // Still upcoming, so the page renders its pre-release state.
        release_at: new Date(Date.now() + 21 * 864e5).toISOString() as string | null,
        destinations: [
          { dsp: 'spotify', url: 'https://open.spotify.com/', sort_order: 1 },
          { dsp: 'apple-music', url: 'https://music.apple.com/', sort_order: 2 },
          { dsp: 'deezer', url: 'https://deezer.com/', sort_order: 3 },
        ],
      },
    ],
  },
  {
    slug: 'low-tide',
    name: 'Low Tide',
    tagline: 'Ambient and modular improvisations',
    theme: { accent: '#1b4d45' },
    profiles: { Instagram: 'https://instagram.com/' },
    hosts: ['lowtide.test'],
    tracking: {
      meta_pixel_id: null as string | null,
      meta_ad_account_id: null as string | null,
      capi_token_ref: 'META_CAPI_TOKEN_LOW_TIDE',
      test_event_code_ref: null as string | null,
    },
    releases: [
      {
        slug: 'shoreline',
        title: 'Shoreline',
        subtitle: 'Low Tide',
        artwork_url: '/demo/low-tide.svg' as string | null,
        isrc: 'GBKQU2411111' as string | null,
        release_at: null as string | null,
        destinations: [
          { dsp: 'spotify', url: 'https://open.spotify.com/', sort_order: 1 },
          { dsp: 'apple-music', url: 'https://music.apple.com/', sort_order: 2 },
        ],
      },
    ],
  },
];

const [account] = await sql<{ id: string }[]>`
  insert into account (name, email) values (${ACCOUNT.name}, ${ACCOUNT.email})
  on conflict (email) do update set name = excluded.name
  returning id
`;
if (!account) throw new Error('Could not create account');

for (const p of PROJECTS) {
  const [project] = await sql<{ id: string }[]>`
    insert into project (account_id, slug, name, tagline, theme, profiles)
    values (${account.id}, ${p.slug}, ${p.name}, ${p.tagline},
            ${sql.json(p.theme)}, ${sql.json(p.profiles)})
    on conflict (account_id, slug) do update
      set name = excluded.name, tagline = excluded.tagline,
          theme = excluded.theme, profiles = excluded.profiles
    returning id
  `;
  if (!project) throw new Error(`Could not create project ${p.slug}`);

  for (const [i, hostname] of p.hosts.entries()) {
    await sql`
      insert into domain (project_id, hostname, is_primary)
      values (${project.id}, ${hostname}, ${i === 0})
      on conflict (hostname) do update
        set project_id = excluded.project_id, is_primary = excluded.is_primary
    `;
  }

  await sql`
    insert into tracking (project_id, meta_pixel_id, meta_ad_account_id, capi_token_ref, test_event_code_ref)
    values (${project.id}, ${p.tracking.meta_pixel_id}, ${p.tracking.meta_ad_account_id},
            ${p.tracking.capi_token_ref}, ${p.tracking.test_event_code_ref})
    on conflict (project_id) do update
      set meta_pixel_id = excluded.meta_pixel_id,
          meta_ad_account_id = excluded.meta_ad_account_id,
          capi_token_ref = excluded.capi_token_ref,
          test_event_code_ref = excluded.test_event_code_ref,
          updated_at = now()
  `;

  for (const r of p.releases) {
    const [release] = await sql<{ id: string }[]>`
      insert into release (project_id, slug, title, subtitle, artwork_url, isrc, release_at)
      values (${project.id}, ${r.slug}, ${r.title}, ${r.subtitle}, ${r.artwork_url},
              ${r.isrc}, ${r.release_at})
      on conflict (project_id, slug) do update
        set title = excluded.title, subtitle = excluded.subtitle,
            artwork_url = excluded.artwork_url, isrc = excluded.isrc,
            release_at = excluded.release_at
      returning id
    `;
    if (!release) throw new Error(`Could not create release ${r.slug}`);

    for (const d of r.destinations) {
      await sql`
        insert into destination (release_id, dsp, url, region, sort_order)
        values (${release.id}, ${d.dsp}, ${d.url}, '*', ${d.sort_order})
        on conflict (release_id, dsp, region) do update
          set url = excluded.url, sort_order = excluded.sort_order
      `;
    }
  }
  console.log(`Seeded ${p.slug} (${p.hosts.join(', ')})`);
}

await sql.end();
console.log('Done.');
