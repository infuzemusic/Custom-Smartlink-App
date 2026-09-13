# Platform architecture — what actually has to be built

Ten subsystems. Roughly in dependency order. The tracking layer (#5) is the differentiator;
everything else is table stakes that has to exist before the differentiator means anything.

---

## 1. Catalogue & link resolution

**Primary key is the ISRC**, not the title. Spotify, Apple Music, Tidal, Deezer, Amazon,
Beatport, MusicBrainz and Discogs all index by ISRC; titles and artist-name ordering
disagree across services constantly. Everything in your data model hangs off ISRC (tracks)
and UPC/EAN (releases).

Resolution strategy, in order of preference:
1. **Artist-supplied** — they paste the Spotify/Apple URL for the release they already have.
2. **Odesli/Songlink API** — the veteran matcher; powers a lot of third-party tooling.
   Free tier, rate-limited; negotiate a commercial key before you depend on it in a hot path.
3. **Per-DSP APIs** — better fidelity, but each has its own auth and quota regime (§3).
4. **Manual override** — always required. Matching is never 100%; give artists an edit UI.

Cache aggressively. Re-resolve on a schedule (links break; regional availability changes).

## 2. Link page renderer

- **SSR/SSG at the edge**, not a client-rendered SPA. This is a hard requirement, driven by
  post-click quality scoring (see `01-facebook-authority.md` §3.8), not by preference.
- Per-tenant theming: colours, fonts, layout variants, custom CSS for power users.
- State machine per release: *pre-release (pre-save)* → *release day* → *evergreen*.
  The page must flip automatically at the release timestamp, per timezone.
- Geo + device routing: DSP availability differs by market; iOS users get Apple Music
  surfaced first, etc. Route, but **don't auto-redirect**.
- Link types to support: smart link, pre-save, link-in-bio/hub, download gate, action gate,
  tour/ticket link, merch link.

## 3. Pre-save engine — *read the risk section first*

Mechanically: OAuth the fan → store a refresh token → a scheduled job fires at release
instant → write to their library → optionally follow the artist → optionally send an email.

Per-DSP reality:

- **Spotify.** This is the single biggest external risk in the whole project. Extended
  quota — which is what you need to run pre-saves at any scale — now requires a legally
  registered business, an already-launched service, and **~250k monthly active users**,
  reviewed over weeks. Development mode is capped hard (a handful of users, owner must hold
  Premium). On top of that the **Feb/Mar 2026 migration** consolidated the library
  endpoints: `PUT /me/tracks`, `PUT /me/albums` and `PUT /me/following` were replaced by a
  generic `PUT /me/library` taking Spotify URIs, with removed endpoints returning 403 after
  9 March 2026. Build against the new endpoints; treat approval as a business-development
  problem to start *now*, not an engineering task for later.
- **Apple Music / MusicKit.** Requires paid Apple Developer Program membership ($99/yr),
  a MusicKit signing key, JWT developer tokens, and a Music User Token per fan. Technically
  the smoothest of the three.
- **Deezer / Amazon / Tidal.** Smaller volume; add opportunistically.

Engineering notes: token vault with encryption at rest; release-day fan-out is a thundering
herd (tens of thousands of writes at one timestamp) so it needs a proper queue with rate
limiting and retry/backoff; handle revoked tokens gracefully; log per-fan outcome so the
artist sees real delivered numbers, not promised ones.

## 4. Multi-tenant custom domains at scale

The hard infrastructure problem, and the thing that makes §3.1 of the authority doc real.

- **Verification**: tenant adds a CNAME (`link.artist.com` → `edge.yourplatform.com`) plus a
  TXT record proving ownership. Poll until it resolves.
- **Certificates**: automated ACME issuance per hostname. Either *on-demand TLS* (Caddy-style,
  issue on first TLS handshake for a hostname in your allowlist) or a managed product like
  Cloudflare for SaaS. Budget for Let's Encrypt rate limits and a fallback CA.
- **Apex domains**: CNAME at the apex is not valid DNS. Handle via ALIAS/ANAME at supporting
  registrars, or a redirect from apex to `link.` subdomain. Document this; it's a top
  support ticket.
- **Renewal monitoring** with alerting — a lapsed cert on an artist's live campaign is a
  revenue-losing incident.
- **Registrar integration** so artists can buy a domain in-flow (see authority doc §3.1).

## 5. Tracking & attribution layer — *the differentiator*

Per tenant, driven entirely by their own credentials:

- Browser pixel injection (Meta, TikTok, Snap, Google, Pinterest) with per-tenant IDs.
- Edge event collector on the tenant's own domain — first-party, server-set `_fbp`,
  `fbclid` → `_fbc` capture.
- CAPI relay with `event_id` dedup, retry queue, and per-tenant token.
- EMQ monitoring surfaced as a per-artist "tracking health" score with specific fixes.
- Programmatic custom-conversion creation via Marketing API.
- Bot/IVT filtering before events fire.
- Consent gating (EU) that degrades to server-only events where consent is absent.

Full detail in `01-facebook-authority.md`.

## 6. Ads integration

Meta Marketing API for custom conversions, custom/lookalike audiences, and (optionally)
campaign creation and reporting. Requires a Meta App with App Review for advanced access —
budget weeks, not days. Symphony's positioning is essentially "AI-powered ad automation on
top of the link" — that's where the pricing power is, but it's phase 3, not phase 1.

## 7. Fan CRM & email

Email/phone capture, double opt-in, consent records with timestamp and source, segmentation
by behaviour (pre-saved / clicked DSP / gate completed), export, and ESP integration
(Klaviyo, Mailchimp, Resend). Captured emails are also your best EMQ input — the CRM and
the tracking layer are the same asset viewed twice.

## 8. Gates

Download gates and action gates ("follow to unlock"). **Risk flag:** SoundCloud paused the
API that enforced follow/repost steps in June 2026 — no tool can enforce those actions any
more, only request them on the honour system. This materially devalues the classic Hypeddit
gate proposition. Email-for-download still works; forced-social-action gates are a shrinking
product surface. Don't build your positioning on them.

## 9. Analytics

Clickstream store (ClickHouse or similar), funnel view (impression → page view → DSP click),
geo/device/referrer breakdowns, per-campaign attribution, cohort retention, and bot-filtered
vs raw counts shown side by side. Artists will compare your numbers to Ads Manager — build
the reconciliation view before they ask for it.

## 10. Accounts, billing, hierarchy

Label/agency → artist → release hierarchy with role-based access, seat management, and
per-artist asset isolation (domain, pixel, ad account). Get this model right at the start;
retrofitting a label tier onto a single-artist data model is a rewrite.

---

## Suggested stack

| Layer | Choice | Why |
|---|---|---|
| Edge/render | Next.js on Cloudflare Workers/Vercel, or Astro + Hono | SSR at edge, cheap, fast LCP |
| Custom domains/TLS | Cloudflare for SaaS, or Caddy on-demand TLS on your own ingress | Solved problem; don't hand-roll ACME |
| API/app | TypeScript (Node/Bun) or Go | One language across edge + services |
| Primary DB | Postgres | Tenancy, catalogue, tokens |
| Events | ClickHouse | Clickstream at volume |
| Queue | Redis/BullMQ or SQS | Release-day fan-out, CAPI retries |
| Secrets | KMS-backed envelope encryption | Tenant ad-account tokens |
| Infra | Terraform | Per-tenant DNS/cert automation is real infra |

## Data model sketch

```
organisation ─┬─ user (role)
              └─ artist ─┬─ domain (hostname, cert_status, verified_at)
                         ├─ tracking_profile (meta_pixel_id, capi_token_ref,
                         │                    tiktok_pixel_id, emq_score, ...)
                         └─ release (upc, release_at, state)
                              ├─ track (isrc)
                              ├─ destination (dsp, url, resolved_from, region)
                              ├─ link_page (slug, type, theme, seo)
                              └─ presave ── fan_token (dsp, refresh_token_ref, status)

event (tenant_id, link_page_id, type, event_id, fbp, fbc, ip, ua, ts, consent, is_bot)
fan (tenant_id, email_hash, external_id, consent_record, source)
```
