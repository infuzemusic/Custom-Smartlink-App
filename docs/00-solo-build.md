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
| Ad account | **start with 1, split later** | The real constraint — see below. |

**The ad account constraint.** A new Business Portfolio starts with **1–5 ad accounts**.
That grows to 25–75 once you're verified with clean spend history, but not immediately. So:

- Start with **one shared ad account**, campaigns named by project.
- You still get two of the three isolation layers free (separate Page, separate domain), which
  is most of the benefit.
- Request more accounts as your limit grows, and split out any project whose risk profile
  differs — heavier paid pushes, edgier creative, anything you'd hate to have take the rest
  down with it.
- Don't fragment prematurely: a new ad account has no spend history, so you reset learning
  and trust every time you split.

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

```
projects/
  <project-slug>/
    project.json           identity, domain(s), theme, tracking IDs
    releases/
      <release-slug>.json  artwork, copy, DSP destinations
app/
  middleware.ts            Host -> project resolution, first-party cookie handling
  [release]/page.tsx       smart link page
  out/[release]/[dsp]      click handler: log -> CAPI -> 302
  api/track                browser event collector
lib/
  projects.ts              registry loader + host index
  meta.ts                  CAPI client, event_id, hashing
```

`project.json`:

```json
{
  "slug": "alias-one",
  "name": "Alias One",
  "hosts": ["aliasone.com", "www.aliasone.com"],
  "tracking": {
    "meta": {
      "pixelId": "000000000000000",
      "capiTokenEnv": "META_CAPI_TOKEN_ALIAS_ONE",
      "testEventCode": null
    }
  },
  "theme": { "accent": "#0E5C52", "font": "Archivo" },
  "profiles": { "spotifyArtist": "...", "instagram": "..." }
}
```

Rules that keep this clean:

- **Resolve by host, never by path.** No `/alias-one/release` URLs — each project's pages
  live at the root of its own domain, or the domain isolation is cosmetic.
- **One CAPI token per project**, referenced by env var *name* in config so no secret is ever
  committed. Name them predictably: `META_CAPI_TOKEN_<SLUG>`.
- **Fail loudly on an unknown host.** A misconfigured domain silently falling back to a
  default project would fire one alias's events into another's pixel — the one bug in this
  system that corrupts data you can't clean up afterwards.
- **DSP destinations as `{ dsp, url, region? }`**, not hardcoded Spotify/Apple fields.
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
- [ ] Create the pixel/dataset; put its ID in `project.json`
- [ ] Create a system user token for CAPI; set `META_CAPI_TOKEN_<SLUG>`
- [ ] Define URL-rule custom conversions for each DSP click
- [ ] Confirm events arrive in Events Manager, deduplicated, with EMQ climbing

## Honest expectation setting

This gets you reputation isolation per project, better attribution than a shared smartlink,
full control of the post-click experience, and each alias's data in its own pixel. It does
not get you Spotify pre-saves, and it doesn't make a weak release convert. The measurement
work is worth doing because it makes ad spend smarter — not because it substitutes for the
music or the creative.
