# Building this for your own projects

> Supersedes the phasing in `03-risks-and-build-plan.md`, which assumed a multi-tenant SaaS.
> Scope here: **one owner, several music projects.** No signup, no billing, no auth — but
> genuinely multi-brand, because each project needs its own domain, Page and pixel.

## What disappears, and what doesn't

| Multi-tenant problem | Your reality |
|---|---|
| ACME at scale, on-demand TLS, registrar API | You add N domains to one hosting project. The host issues certs. |
| Token custody: KMS, per-tenant keys, audit log, DPA | One CAPI token per project, in environment variables. |
| Meta App Review for `ads_management` | Not needed. System user tokens in your own Business Portfolio reach your own assets. |
| Programmatic custom-conversion creation | Do it by hand once per project in Events Manager. |
| Fan CRM, billing, hierarchy, seats, moderation | Gone. |
| **Per-project config, host routing, isolated tracking** | **Needed. This is the part that survives.** |
| **Pre-save engine** | **Cannot be built. See below.** |

The earlier advice to "keep a config object as cheap insurance and don't build multi-tenancy"
no longer holds. With several projects the registry *is* the architecture — build it on day
one, because retrofitting host-based routing onto hardcoded single-project assumptions is
the exact rewrite it was meant to avoid.

**The authority advantage is still nearly free**, just multiplied: one domain purchase and
one verification per project.

## Meta asset structure

The reputation propagation described in `01-facebook-authority.md` runs across *Page, domain
and ad account*. With several projects you want those isolated from each other so an
aggressive campaign on one alias can't drag the others down.

| Asset | How many | Notes |
|---|---|---|
| Business Portfolio | **1** | You can hold 2 per personal profile; you need one. All projects live inside it. |
| Facebook Page | **1 per project** | You need these anyway — each act has its own artist Page. Isolation comes free. |
| Domain | **1 per project** | Must be a root domain (eTLD+1). Verified in your single portfolio — no conflict, since you own them all. |
| Pixel / dataset | **1 per project** | Never share a pixel across aliases: it merges audiences that shouldn't be merged and pools signal quality. |
| Ad account | **1 per project** | Already in place. Full isolation available from day one. |

**You already have an ad account per project**, so all three reputation entities — Page,
domain, ad account — are isolated per alias once the domains land. Worth knowing that this
is not the default position: a new Business Portfolio is capped at 1–5 ad accounts and only
grows to 25–75 with verification and clean spend history, so you're starting from an
established portfolio rather than building one.

Two things to get right now that the accounts exist:

- **Assign assets deliberately.** Each project's pixel and Page should be assigned to that
  project's ad account and nothing else. Domains are verified once at the portfolio level and
  are visible across it — that's fine and unavoidable, since you own them all.
- **Don't consolidate later for convenience.** Merging campaigns into one account to simplify
  reporting would throw away the isolation you already have. Keep reporting in a spreadsheet
  or a dashboard instead.

**The domain is your missing layer.** If those ad accounts currently point at a shared
smartlink host, you already have two-thirds of the isolation and are losing it at the last
step — every project's post-click signal lands on someone else's domain reputation. That is
precisely the gap this build closes.

**Budget:** roughly $12–15 per domain per year, times the number of projects you'll actually
advertise. That's the only per-project cost of the whole architecture.

**A cheaper tier for projects you aren't advertising yet.** Park them on subdomains of one
house domain (`sideproject.yourhouse.com`). They'll pool reputation *with each other* — which
is fine while no paid traffic touches them. Promote a project to its own root domain the
moment you start spending on it.

## The pre-save wall

Spotify's Web API is closed to you, and having several projects doesn't change it:

- **Development mode allows 5 users, total** (lowered from 25 in February 2026), and the app
  owner must hold an active Premium subscription.
- **Extended quota** requires a legally registered business, an active launched service, and
  roughly **250,000 monthly active users**. Individuals haven't been accepted since May 2025.
- Independent developers are, in practice, permanently stuck in development mode.

Don't write a Spotify pre-save flow. Three routes instead:

1. **Spotify Countdown Pages** — native in-app pre-save, and the best option because the
   signal reaches Spotify's editorial systems directly. Needs **3,000+ monthly listeners**
   on that project, Admin or Editor access in Spotify for Artists, and a **new original album
   or EP** via your distributor. **Singles are not eligible.** Note this is per project — a
   newer alias may not qualify while an established one does.
2. **Apple Music pre-add via MusicKit** — buildable solo. $99/yr Apple Developer Program, a
   MusicKit signing key, JWT developer tokens, a Music User Token per fan. No MAU gate, and
   one developer account covers all your projects.
3. **Embed a third party** for that one function. The pre-save page is where the
   shared-domain penalty matters least — it rarely takes cold paid traffic.

## Architecture

One codebase, one deployment, N domains. The host header selects the project.
**Postgres from day one** — not JSON files in the repo. The schema carries an `account`
table with exactly one row for now, so adding users later is inserting rows and putting an
auth check in front of queries, not restructuring everything.

```sql
account      id, name, created_at                      -- one row: you
project      id, account_id, slug, name, theme         -- one per music project
domain       id, project_id, hostname, is_primary      -- host lookup index
tracking     id, project_id, meta_pixel_id,
             meta_ad_account_id, capi_token_ref        -- ref, never the secret
release      id, project_id, slug, title, artwork,
             release_at, state                         -- pre-release | live
destination  id, release_id, dsp, url, region          -- adapter-shaped, not per-DSP columns
event        id, project_id, release_id, dsp, type,
             event_id, fbp, fbc, ip, ua, ts, is_bot    -- your own click log
```

```
app/
  middleware.ts            Host -> project resolution, first-party cookie handling
  [release]/page.tsx       smart link page
  out/[release]/[dsp]      click handler: log -> CAPI -> 302
  api/track                browser event collector
lib/
  projects.ts              host -> project lookup, cached
  meta.ts                  CAPI client, event_id, hashing
```

Managed Postgres (Neon, Supabase) on a free tier is plenty at this volume. Cache the
host→project lookup in memory; it changes when you add a project, not per request.

Rules that keep this clean:

- **`account_id` on `project` from the first migration.** That single column is the entire
  difference between "add users later" and "rewrite later". Nothing else needs to anticipate
  commercialisation.
- **Secrets stay out of the database.** `capi_token_ref` holds an env var name
  (`META_CAPI_TOKEN_<SLUG>`), not a token. When it does become commercial that column becomes
  a KMS key reference — same shape, different backend.
- **Resolve by host, never by path.** No `/alias-one/release` URLs — each project's pages
  live at the root of its own domain, or the domain isolation is cosmetic.
- **Fail loudly on an unknown host.** A misconfigured domain silently falling back to a
  default project would fire one alias's events into another's pixel — the one bug in this
  system that corrupts data you can't clean up afterwards.
- Keep the click handler's event payload generic — it shouldn't know it's Meta-specific.

## The parts that need care

1. **Server-set first-party cookies.** In edge middleware, set `_fbp` yourself as an HttpOnly
   first-party cookie if absent, and capture `fbclid` into `_fbc`
   (`fb.1.<timestamp_ms>.<fbclid>`). Cookies are per-domain, so this is naturally isolated
   per project. This beats Safari's 7-day ITP cap on JS-set cookies, and it's the main reason
   to run your own pages at all.
2. **Dual-fire with deduplication.** One `event_id` per event, sent on both the browser pixel
   and the server CAPI call, with matching `event_name`. Mismatched IDs double-count, which
   is worse than no CAPI.
3. **Never hash `fbp` or `fbc`.** Hash `em`/`ph` (SHA-256, lowercased, trimmed). Send
   `external_id`, `client_ip_address`, `client_user_agent`, `event_source_url` and the click
   timestamp unhashed. Watch Event Match Quality per project; aim for 8+.
4. **The click is the conversion.** Spotify is a third party — you cannot pixel it and it
   reports nothing back. Your `/out/` route is the only real conversion signal you will ever
   have. Fire a distinct event per DSP.
5. **Don't auto-redirect the landing page.** Real content — player embed, artwork, bio, other
   releases. A bare redirect bridge is what post-click quality scoring is built to punish.

## Per-project setup checklist

Half an hour each, all manual, all one-time:

- [ ] Buy the root domain; add it to the hosting project
- [ ] Create the Facebook Page (if the project doesn't have one)
- [ ] Verify the domain in your Business Portfolio
- [ ] Create the pixel/dataset; assign it to this project's ad account only
- [ ] Put the pixel ID and ad account ID in `project.json`
- [ ] Create a system user token for CAPI; set `META_CAPI_TOKEN_<SLUG>`
- [ ] Define URL-rule custom conversions for each DSP click
- [ ] Confirm events arrive in Events Manager, deduplicated, with EMQ climbing

## Honest expectation setting

This gets you reputation isolation per project, better attribution than a shared smartlink,
full control of the post-click experience, and each alias's data in its own pixel. It does
not get you Spotify pre-saves, and it doesn't make a weak release convert. The measurement
work is worth doing because it makes ad spend smarter — not because it substitutes for the
music or the creative.
