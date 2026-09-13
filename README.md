# Custom Smartlink App

A multi-tenant smartlink / pre-save platform for musicians, in the vein of Symphony,
Hypeddit and Song.so — built around one structural differentiator: **every artist's links
run on a domain the artist owns, with the artist's own Meta pixel and Conversions API**, so
Meta ad reputation, attribution and measurement are isolated per artist instead of pooled
across a shared platform domain.

## Status

Working v1. Smart link pages, host-routed multi-project support, server-set first-party
cookies, and pixel/CAPI dual-fire with deduplication.

**Current scope: one owner, several music projects — not a SaaS.** Start with
[`docs/00-solo-build.md`](docs/00-solo-build.md) — it supersedes the phased plan in
`docs/03`, which assumed multi-tenancy. The remaining docs stay useful as market research
and as the shape to grow into if this is ever productised.

## Documents

| Doc | What's in it |
|---|---|
| [`docs/00-solo-build.md`](docs/00-solo-build.md) | The active plan: Meta asset structure across several projects, host-routed architecture, the Spotify pre-save wall, and a per-project setup checklist. |
| [`docs/01-facebook-authority.md`](docs/01-facebook-authority.md) | The "Facebook authority scoring" problem diagnosed properly — what Meta actually does, why shared smartlink domains lose, and the nine-part solution set. **Start here.** |
| [`docs/02-platform-architecture.md`](docs/02-platform-architecture.md) | The ten subsystems that have to be built, suggested stack, data model. |
| [`docs/03-risks-and-build-plan.md`](docs/03-risks-and-build-plan.md) | Competitive landscape, risk register, phased build plan, defensible advantages. |

## Two things to know before reading

1. **Research was conducted under a restrictive network egress policy.** `song.so`,
   `hypeddit.com`, `symphonyos.co`, `developers.facebook.com`, `developer.spotify.com` and
   `help.linkfire.com` were all unreachable. Findings are from server-side web search and
   first-principles reconstruction. Claims that could not be verified firsthand are marked
   as such — most importantly, **Song.so's specific "authority scoring" claim is unverified.**
2. **There is no open-source prior art.** Symphony, Hypeddit and Song.so are closed SaaS with
   no public code. Only component-level open source exists (Odesli API wrappers, MusicKit
   token generators, link-in-bio clones). This is a from-scratch build.

## The two decisions that gate everything else

- **Will artists buy and connect their own domain?** The entire differentiator depends on
  yes. Validate with real artists before Phase 1.
- **Spotify pre-save is unavailable to individuals.** Development mode caps at 5 users;
  extended quota requires a registered business and ~250k MAU. Use Spotify's native
  Countdown Pages, build Apple Music pre-add via MusicKit, or embed a third party. See
  `docs/00-solo-build.md`.


## Running it

```bash
npm install
cp .env.example .env            # set DATABASE_URL, then a CAPI token per project
npm run db:migrate              # apply db/schema.sql
npm run db:seed                 # edit the PROJECTS block in db/seed.ts first
npm run dev
```

Managed Postgres (Neon, Supabase) on a free tier is ample. `db/seed.ts` seeds `localhost`
as a hostname for the example project, so `http://localhost:3000` resolves in development.

### Routes

| Route | Does |
|---|---|
| `/` | Project hub — releases at the root of that project's own domain |
| `/<release>` | Smart link page. No auto-redirect, by design |
| `/out/<release>/<dsp>` | Click handler: logs, fires CAPI, 302s to the DSP |
| `/api/track` | Server mirror of the browser PageView |
| `/admin` | Manage projects, domains, tracking, releases and links |

### Admin

```bash
npm run admin:hash -- yourpassword   # prints ADMIN_PASSWORD_HASH
```

Set `ADMIN_HOST`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, then sign in at
`https://<ADMIN_HOST>/admin`. It manages projects, their domains, per-project tracking IDs,
releases and DSP links, and shows 30-day view/click/bot/CAPI-failure counts per project.

`ADMIN_HOST` must not be one of your project domains — the admin 404s anywhere else, so it
is never served from a page you run ads to. Leaving it unset disables the admin in
production entirely rather than exposing it.

The tracking form takes the **name** of the environment variable holding each project's CAPI
token, and refuses a value that looks like a token. It also shows whether that variable is
actually set in the running deployment, which is the fastest way to spot why events stopped.

### Creating a release

Paste any streaming link into the wizard and it resolves every other platform through
Odesli, imports the cover, and samples the page's accent colour from that artwork. You can
edit the title, subtitle and slug, and untick any platform you don't want listed, before
creating it.

Artwork is downloaded and stored in Postgres rather than hotlinked, and served from
`/artwork/<release-id>` on your own domain — streaming services rotate their CDN URLs, and
a release page whose cover 404s six months later is worse than no cover.

The sampled accent is corrected per theme before it is used: artwork colours are chosen to
work against each other, not against a page, so a pale yellow would vanish on the light
background and a deep navy on the dark one. Both variants are pushed to at least 4.5:1
contrast while keeping the hue. Greyscale artwork gets a neutral accent rather than an
invented hue.

Adding links by hand still works — it's behind a disclosure on the project page.

### Testing

```bash
npm run test:palette   # colour sampling and contrast correction; no server needed
npm run e2e            # admin flows in a real browser; needs the app running
npm run stub &         # stands in for api.song.link
npm run e2e:wizard     # release wizard against that stub
```

The wizard suite needs the app started with `ODESLI_BASE_URL=http://127.0.0.1:4010` and
`ALLOW_LOCAL_FETCH=1` so lookups and artwork downloads hit the stub instead of the internet.

Server actions cannot be meaningfully exercised over plain HTTP, so the admin is covered by
a browser-driven suite instead: sign-in, every validation path, create/edit/delete for
projects, domains, releases and destinations, and sign-out. It cleans up after itself.
Set `CHROMIUM_PATH` if your Playwright package and installed browser builds differ.

### Per-project setup

Each project needs its own root domain, Facebook Page, pixel and ad account — see
[`docs/00-solo-build.md`](docs/00-solo-build.md) for the checklist and the reasoning. In the
database: a `project` row, its hostnames in `domain`, and a `tracking` row holding the pixel
ID plus the **name** of the env var containing that project's CAPI token
(`META_CAPI_TOKEN_<SLUG>`). Tokens themselves never go in the database.

Point your Meta custom conversions at the `/out/<release>/<dsp>` URL pattern, or use the
`DspClick` custom event, which carries the release and DSP in `custom_data`.

### Things worth knowing before changing the code

- **An unknown host 404s and never falls back to a default project.** A silent fallback
  would fire one project's events into another project's pixel — the one bug here that
  corrupts data you cannot clean up afterwards.
- **`_fbp` is set with `httpOnly: false` on purpose.** The Meta pixel reads it from
  `document.cookie`; if it can't see ours it invents its own, and the browser and server
  events stop matching. Setting it from a `Set-Cookie` header is what dodges Safari's 7-day
  ITP cap on JavaScript-set cookies.
- **`fbp` and `fbc` are sent to Meta unhashed.** Hashing them breaks matching entirely.
  `em`, `ph` and `external_id` are SHA-256 hashed.
- **The event id must match on both sides.** The browser generates it, fires the pixel, and
  passes it to `/out/` as `?eid=`. Mismatched ids double-count, which is worse than sending
  no server events at all.
- **A CAPI failure never costs the visitor their click** — the redirect happens regardless.

### Verified

Migration, seed, both page types, server-set `_fbp`, `fbclid` → `_fbc`, the click redirect,
bot filtering, the PageView mirror, unknown-host 404 and event logging were all exercised
against a real Postgres. The Conversions API request is built and sent — confirmed by its
outbound call and graceful failure handling — but **Meta accepting the payload is
unverified**, since `graph.facebook.com` was unreachable from the build environment. Check
Events Manager's Test Events tab on first deploy (set `META_TEST_EVENT_CODE_<SLUG>`).
