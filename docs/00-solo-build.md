# Building this for one artist (you)

> Supersedes the phasing in `03-risks-and-build-plan.md`, which assumed a multi-tenant SaaS.
> The other docs remain accurate as market research and as the design to grow into *if* you
> later productise. Read this one first.

## What disappears when it's just you

| Multi-tenant problem | Solo reality |
|---|---|
| ACME at scale, on-demand TLS, apex CNAME handling, registrar API | You own one domain. Point it at your host. Done. |
| Token custody: KMS envelope encryption, per-tenant keys, audit log, DPA | Your own CAPI token in an environment variable. |
| Meta App Review for `ads_management` advanced access | Not needed. A system user token in your own Business Manager reaches your own assets. |
| Programmatic custom-conversion creation via Marketing API | Click it once, by hand, in Events Manager. Ten minutes, forever. |
| Fan CRM, billing, label hierarchy, seat management, content moderation | Gone. |
| Bot filtering as a sellable feature | Still worth a cheap edge check, but it's hygiene, not product. |
| **Pre-save engine** | **Cannot be built. See below.** |

**The authority advantage is free for you.** The entire competitive thesis of the research —
artist-owned apex domain, your own pixel, isolated reputation — costs you a domain purchase
and one domain verification in Business Manager. There is nothing to engineer. What *is*
worth engineering is the measurement quality underneath it: server-side CAPI, deduplication,
first-party cookies set at the edge.

## The pre-save wall — read this before planning a release

Spotify's Web API is closed to you:

- **Development mode allows 5 users, total.** Lowered from 25 in February 2026. The app
  owner must also hold an active Premium subscription.
- **Extended quota** requires a legally registered business, an active launched service,
  availability in key markets, and roughly **250,000 monthly active users**. Individuals
  have not been accepted since May 2025.
- Independent developers are, in practice, permanently stuck in development mode.

So do not write a Spotify pre-save flow. Three legitimate routes instead:

1. **Spotify Countdown Pages** — Spotify's own native in-app pre-save, and the best option
   because pre-save signal registers directly with Spotify's editorial systems. Requirements
   as of mid-2026: at least **3,000 monthly listeners**, Admin or Editor access in Spotify
   for Artists, and a **new original album or EP** delivered via your distributor.
   **Singles are not eligible.** Link to it from your own page.
2. **Apple Music pre-add via MusicKit** — genuinely buildable solo. Paid Apple Developer
   Program ($99/yr), a MusicKit signing key, JWT developer tokens, a Music User Token per
   fan. No MAU gate. If you want one pre-save mechanic you own, this is the one.
3. **Embed a third-party pre-save** (Hypeddit, Feature.fm, ListenTo) for that single function
   while your own pages do everything else. Ugly, but it works, and the pre-save page is the
   one page where the shared-domain penalty matters least — you're not usually running cold
   paid traffic at a pre-save.

If you don't clear the 3,000-listener bar yet, the honest answer is that pre-save is not your
bottleneck. Ship the links.

## What to actually build

A single-artist site on your own domain, with a properly instrumented click path. Roughly a
weekend for v1, not ten weeks.

```
yourdomain.com/                     hub / link-in-bio
yourdomain.com/<release-slug>       smart link page (SSR, real content, no auto-redirect)
yourdomain.com/out/<slug>/<dsp>     click handler: log, fire CAPI, 302 to the DSP
yourdomain.com/api/track            browser event collector (pixel mirror)
```

**Stack:** Next.js (App Router) on Vercel or Cloudflare. Releases as JSON or MDX files
committed to this repo — no CMS, no database for v1. Add storage only when you want
historical click analysis beyond what Meta shows you.

**The parts that actually need care:**

1. **Server-set first-party cookies.** In middleware at the edge, set `_fbp` yourself as an
   HttpOnly first-party cookie if absent, and capture `fbclid` into `_fbc`
   (`fb.1.<timestamp_ms>.<fbclid>`). This is what beats Safari's 7-day ITP cap on JS-set
   cookies, and it's the main reason to run your own pages at all.
2. **Dual-fire with deduplication.** Generate one `event_id` per event. Fire the browser
   pixel with it *and* send the same `event_id` and `event_name` via CAPI from the server.
   Mismatched IDs double-count, which is worse than no CAPI.
3. **Never hash `fbp` or `fbc`.** Hash `em`/`ph` (SHA-256, lowercased, trimmed). Send
   `external_id`, `client_ip_address`, `client_user_agent`, `event_source_url` and the click
   timestamp unhashed. Watch Event Match Quality in Events Manager; aim for 8+.
4. **The click is the conversion.** Spotify is a third party — you cannot pixel it and it
   reports nothing back. Your `/out/` route is the only real conversion signal you will ever
   have. Fire a distinct event per DSP there.
5. **Don't auto-redirect the landing page.** Give it real content — player embed, artwork,
   bio, other releases. A bare redirect bridge is what Meta's post-click quality scoring is
   built to punish, and it's free to avoid when you control the page.

**One-time manual setup** (do this before writing code, it takes half an hour):
buy/point the domain → verify it in *your* Business Manager → create the pixel → create a
system user token for CAPI → define URL-rule custom conversions for each DSP click.

## Keeping the door open to productising later

Cheap insurance, worth taking; anything more is premature:

- Put all Meta IDs and the artist's details in **one config object**, not scattered literals.
  That object becomes the per-tenant record later.
- Give the DSP destinations an **adapter shape** (`{ dsp, url, region? }`) rather than
  hardcoded Spotify/Apple fields.
- Keep the click handler's event payload **generic** — it should not know it's Meta-specific.

Do not build a tenant table, an auth system, or a domain-provisioning flow. If the product
works for you, you'll know within two releases, and by then you'll have real requirements
instead of guessed ones.

## Honest expectation setting

Running your own pages gets you: reputation isolation, better attribution than a shared
smartlink, full control of the post-click experience, and your data in your own pixel. It
does not get you Spotify pre-saves, and it does not make a weak release convert. The
measurement work is worth doing because it makes your ad spend smarter — not because it
substitutes for the music or the creative.
