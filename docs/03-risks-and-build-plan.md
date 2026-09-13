# Risks, competitive landscape, and a build plan

## 1. Competitive landscape (as of research date)

| Platform | Positioning | Pixel / CAPI / custom domain | Notes |
|---|---|---|---|
| **Hypeddit** | Cheapest full suite; fan gates are the hook | Meta Pixel, CAPI, TikTok pixel, custom domains — added early, ahead of most rivals | Free tier w/ branding; ~$10/mo Basic, ~$20/mo AI ad tools. Gate proposition weakened by the SoundCloud API pause (June 2026). |
| **Symphony (SymphonyOS)** | AI marketing automation for artists/labels; ads + site + CRM + analytics | Yes, plus automated ad creation | Credit-based pricing (~$25 / $49 / $99 per month tiers); claims 100k+ artists. Competes on automation, not on links. |
| **Song.so** | Claims a specific solution to Meta "authority scoring" | **Unverified — domain blocked in this session** | Needs first-hand review before you benchmark against it. |
| Linkfire / Feature.fm / ToneDen / Odesli | Incumbents | Varies; custom domain support is now standard at the paid tier | Odesli is free and is the de-facto metadata matcher for the ecosystem. |

**Open-source availability: effectively zero.** All of the above are closed SaaS. What exists
publicly is component-level only — Odesli/Songlink API wrappers, Apple MusicKit token
generators, generic link-in-bio clones. There is no reference implementation to fork; the
build is from scratch.

## 2. Risk register

| Risk | Severity | Notes / mitigation |
|---|---|---|
| **Spotify extended-quota gate (250k MAU, registered business, launched service)** | **Critical** | Blocks pre-saves at scale. This is the single biggest threat to the product plan. Mitigate: launch links-first without pre-save, build MAU, apply early; or partner with/acquire an app that already holds extended quota. Start the conversation before writing pre-save code. |
| Spotify Feb/Mar 2026 endpoint migration | High | Library endpoints consolidated to `/me/library`; old ones 403 after 9 Mar 2026. Build against current spec only. |
| DSP API terms change unilaterally | High | Abstract every DSP behind an adapter interface. Assume at least one breaks per year. |
| Meta App Review for `ads_management` / advanced access | High | Weeks of lead time. Start the app submission in parallel with development. |
| Custody of tenant ad-account tokens | High | Tokens that can spend money. KMS envelope encryption, per-tenant keys, audit log, DPA, prefer revocable Partner access over user OAuth. |
| Forced social-action gates dying (SoundCloud API paused June 2026) | Medium | Don't build positioning on gates. Email-for-download still works. |
| GDPR/CCPA — you are a processor for artists, sending hashed PII to Meta | Medium | Consent management, DPA template, EU data handling, server-only event degradation without consent. |
| Bot/invalid traffic poisoning tenant pixels | Medium | Edge filtering before events fire. Also a sellable feature. |
| Let's Encrypt rate limits at domain scale | Medium | Managed TLS product or a second ACME CA as fallback. |
| Odesli dependency in a hot path | Low–Medium | Cache + fall back to artist-supplied URLs + manual override. |

## 3. Build plan

### Phase 0 — De-risk before writing product code (2–4 weeks, mostly non-engineering)
- Review Song.so firsthand and benchmark its actual claim against `01-facebook-authority.md`.
- Open the Spotify extended-quota conversation; understand the real bar for your case.
- Register the Meta App; begin App Review for the permissions you'll need.
- Apple Developer Program enrolment; Odesli commercial terms.
- Validate the core bet with 3–5 real artists: *will they buy and connect their own domain?*
  The entire differentiator rests on a "yes".

### Phase 1 — MVP: the authority-isolated smart link (6–10 weeks)
Custom-domain onboarding + automated TLS · SSR link page with real content · ISRC-based
resolution (artist-supplied + Odesli) · per-tenant Meta pixel + CAPI with dedup and
server-set first-party cookies · programmatic custom conversions · EMQ health dashboard ·
basic click analytics.

**This alone is a sellable product** and it is the part competitors structurally can't match.

### Phase 2 — Fan capture & retention (4–6 weeks)
Email capture + double opt-in · fan CRM + segments · ESP integrations · link-in-bio hub ·
download gates (email-for-download) · TikTok/Snap/Google pixels.

### Phase 3 — Pre-save (4–8 weeks, *gated on Spotify approval*)
Spotify + Apple + Deezer pre-save · token vault · release-day scheduler with rate-limited
fan-out · delivery reporting.

### Phase 4 — Ads automation (8–12 weeks)
Marketing API campaign creation · audience/lookalike sync from CRM · creative generation
tied to link-page assets (which also enforces ad-to-page consistency) · reporting
reconciliation against Ads Manager.

### Phase 5 — Labels & scale
Multi-artist hierarchy, roles, white-label, agency billing.

## 4. Where the genuinely defensible advantages are

Ranked by how hard they are for an incumbent to copy:

1. **Artist-owned-apex-domain onboarding that a non-technical artist can actually complete**
   — including buying the domain in-flow. Incumbents are architecturally committed to their
   own shared domains and to the SEO/brand value those carry; moving off them is a business
   decision they won't make.
2. **Zero-touch Meta tracking setup** — pixel, CAPI, custom conversions, dedup and EMQ all
   configured programmatically, with a health score and specific remediation. Today this is
   a manual, error-prone, tutorial-driven chore for every artist on every platform.
3. **Post-click quality as a product feature** — pages engineered to pass Meta's landing-page
   consistency and quality scoring, with ad creative generated from the same assets.
4. **Honest measurement** — bot-filtered numbers and an Ads Manager reconciliation view.
   Low-glamour, high-trust, and nobody does it well.
5. Everything else (link types, themes, gates, CRM) is table stakes. Build it, don't pitch it.
