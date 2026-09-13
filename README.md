# Custom Smartlink App

A multi-tenant smartlink / pre-save platform for musicians, in the vein of Symphony,
Hypeddit and Song.so — built around one structural differentiator: **every artist's links
run on a domain the artist owns, with the artist's own Meta pixel and Conversions API**, so
Meta ad reputation, attribution and measurement are isolated per artist instead of pooled
across a shared platform domain.

## Status

Research and architecture only. No implementation yet.

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
