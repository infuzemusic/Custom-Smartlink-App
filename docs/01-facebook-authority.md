# The "Facebook authority" problem — what it actually is, and how to solve it

> **Research caveat.** Every primary source for this document was blocked by this
> session's network egress policy: `song.so`, `hypeddit.com`, `symphonyos.co`,
> `developers.facebook.com`, `developer.spotify.com`, `help.linkfire.com`. Findings below
> come from server-side web search plus first-principles reconstruction of Meta's
> documented behaviour. **I could not verify Song.so's specific marketing claim about
> "authority scoring" firsthand** — paste their page text and I'll reconcile it against
> this analysis. Nothing here depends on that claim being worded a particular way; the
> underlying mechanics are what they are.

---

## 1. There is no metric called "authority score"

Meta does not publish anything named "authority score" or "domain authority". That phrase
is marketing shorthand used in the music-marketing world. What genuinely exists, and what
the phrase is pointing at, is **four separate real mechanisms** that together decide
whether an artist's ads deliver cheaply or get throttled:

| # | Real mechanism | What it does |
|---|---|---|
| 1 | **Ad-level diagnostics** — Quality Ranking, Engagement Rate Ranking, Conversion Rate Ranking | Relative percentile vs. ads competing for the same audience. Fed by hides, reports, negative feedback, and post-click behaviour. |
| 2 | **Entity-level reputation propagation** | Meta's stated behaviour: repeated low-quality or policy-violating ads cause its systems to *"start considering all ads from your Page, domain, ad account or other associated entities as lower quality."* **The domain is one of those entities.** |
| 3 | **Post-click experience scoring** | Meta scores the landing page itself — speed, thin content, interstitials, popups, and (per 2026 updates) how closely the page matches what the ad promised. Poor scores reduce delivery or pause it. |
| 4 | **Attribution/measurement quality** | Domain Verification, `_fbp`/`_fbc` first-party cookies, Conversions API, and Event Match Quality (EMQ, 0–10). Low-quality signal = worse optimisation = higher CPA, which then *looks* like a penalty. |

Mechanism **#2 is the one that matters most** for smartlinks, and it is the actual answer
to the question "why do shared smartlink domains underperform".

---

## 2. The shared-domain trap — five concrete failure modes

When an artist runs Meta ads to `hypeddit.com/xyz`, `ffm.to/xyz`, `li.sten.to/xyz`, or
`yourplatform.com/artist/xyz`, the domain entity Meta is scoring is **the platform's
domain, shared by every other advertiser on it.** Five things break:

### 2a. Reputation pooling
Your ads inherit the aggregate reputation of every other advertiser using that domain.
Thousands of accounts, some running low-quality or borderline-policy creative, all feeding
the same domain entity. You cannot opt out and you cannot see it. A clean creative on a
poisoned domain can still be throttled.

### 2b. You cannot verify a domain you don't own
Domain Verification in Meta Business Manager is **exclusive — one domain, one Business
Manager.** The platform has verified `hypeddit.com`; no artist can also verify it. Without
verification the artist has no link-ownership rights over that domain, no editing control
over link previews, and weaker standing in any dispute.

### 2c. Giving each artist a subdomain on *your* root does not fix it
This is the trap most "custom subdomain" offerings fall into. Meta's Domain Verification
operates at **eTLD+1** — `artist.yourplatform.com` cannot be independently verified; only
`yourplatform.com` can. So a per-artist subdomain on your domain is **still one shared
domain entity** as far as Meta is concerned. It looks like isolation. It isn't.

### 2d. Cookie scope and attribution continuity
`_fbp` (browser ID) and `_fbc` (click ID, derived from the `fbclid` URL parameter) are
**first-party cookies scoped to the domain that sets them.** On a shared platform domain
the artist has no control over how they're set, no ability to set them server-side, and
under Safari/ITP any JS-set cookie is capped at 7 days. Attribution degrades, EMQ drops,
and the campaign optimises on worse data.

### 2e. Ad-to-landing-page consistency scoring
A classic smartlink page is a thin bridge — a cover image, a list of DSP buttons, an
immediate redirect out. That is close to the textbook description of a low-value post-click
experience, and 2026 policy updates specifically expanded ad-to-landing-page consistency
checks. **The generic smartlink page format is itself an authority liability**, independent
of which domain it sits on.

---

## 3. The solution set — what an "exclusive solution" actually consists of

This is nine engineering decisions, not one feature. Items 1–3 are the core; the rest are
what separates a working implementation from a marketing bullet point.

### 3.1 Artist-owned apex domain, platform-hosted
The artist buys and owns `artistname.com`. They point `link.artistname.com` (CNAME) at your
edge. They verify **`artistname.com`** — their own apex — in **their own** Business Manager.

The domain entity Meta scores is now theirs exclusively. Reputation is isolated per tenant
by construction. This is the whole ballgame, and it is the one thing a shared-domain
competitor structurally cannot offer.

*Corollary:* you must make buying/connecting a domain nearly frictionless, because this is
the step that loses non-technical artists. Registrar API integration (Namecheap/Porkbun/
Cloudflare Registrar) so they can buy a domain inside your onboarding flow is a serious
competitive moat, not a nice-to-have.

### 3.2 Per-tenant pixel — the artist's own, never yours
Every event fires into **the artist's own Pixel ID in their own ad account.** You never put
a platform-wide pixel on tenant pages (beyond, at most, a separate first-party analytics
collector you control). Their pixel, their dataset, their custom audiences, their lookalikes,
portable if they leave.

### 3.3 Per-tenant server-side Conversions API
Your edge sends a mirrored server event to the artist's dataset via CAPI, authenticated with
a token the artist grants you (system user token via Business Manager partner access — see
§4). Meta's own lift studies put CAPI-on-top-of-pixel at roughly **+13–19% attributed
conversions**; in practice on music traffic the gap is bigger because iOS share is high.

### 3.4 Server-side first-party cookies
Because you control the artist's subdomain at the edge, set `_fbp` **server-side** as an
HttpOnly first-party cookie, and capture `fbclid` → construct `_fbc` yourself
(`fb.1.<timestamp>.<fbclid>`). This sidesteps the ITP 7-day truncation that hits JS-set
cookies. **Never hash `fbp`/`fbc`** — hashing them destroys matching entirely.

### 3.5 Browser↔server deduplication
Same `event_id` + same `event_name` on both the pixel event and the CAPI event, so Meta
collapses them. Get this wrong and you double-count, which is worse than no CAPI at all.

### 3.6 Maximise Event Match Quality
Send every identifier you legitimately hold, hashed per Meta's spec where required:
`em` (email), `ph`, `external_id` (your own stable visitor ID — cheap, and it lifts EMQ a
lot), plus unhashed `fbp`, `fbc`, `client_ip_address`, `client_user_agent`,
`event_source_url`, and the click timestamp. Target EMQ 8+; 5/10 → 8/10 is a routine,
measurable win and a great thing to expose in your dashboard as a health score.

### 3.7 Programmatic per-artist custom conversions
The only thing a smartlink can truly measure is the **outbound click to the DSP** — Spotify
is a third-party destination, you cannot pixel it, and it passes nothing back. So the
optimisable event is a URL-rule-based custom conversion on the click. Create these
**programmatically per artist via the Marketing API** at link-creation time, so a
non-technical artist never touches Events Manager. This is the single biggest UX
differentiator available; every competitor makes the artist do this by hand once and most
artists do it wrong.

*Note on currency:* the old AEM story (8-event limit, manual event prioritisation) is
**obsolete** — Meta removed the limit and retired the manual AEM configuration interface in
mid-2025, and events are now aggregated automatically. Much of the competitor documentation
and YouTube tutorials still in circulation describes that dead workflow. Build for the
current model, and treat this as a marketing opportunity: most of the field is teaching a
2021 playbook.

### 3.8 Page quality as an engineering requirement
Directly targets mechanism #3 above:
- Real content, not a bridge: embedded player/preview, artist bio, imagery, other releases.
- Sub-1s LCP from the edge; the page must be SSR/static, not a client-side SPA shell.
- **No auto-redirect interstitial.** Let the user choose their DSP. Auto-redirect is exactly
  the pattern post-click quality scoring is designed to punish.
- Ad-to-page consistency: the ad creative's imagery and copy must be echoed on the page.
  Worth building as a product feature — generate ad creative *from* the link page assets so
  they can't drift.
- Real privacy policy, cookie consent (EU), proper OG/Twitter tags, no popups on entry.

### 3.9 Blast-radius containment
Per-tenant domain isolation only holds if you also police your own estate: content
moderation on tenant pages, abuse detection, and bot/invalid-traffic filtering at the edge
*before* events fire (bot clicks inflate events, wreck EMQ and train the algorithm on
garbage). Otherwise you rebuild the shared-reputation problem inside your own platform.

---

## 4. The awkward part nobody markets: token custody

To fire CAPI into an artist's dataset and create custom conversions in their ad account, you
need credentialed access to *their* Meta assets. Two models:

- **Business Manager partner access** — the artist adds your business as a Partner on their
  Business/ad account and grants asset permissions. Cleaner, revocable, auditable, survives
  password changes. Requires them to have a real Business Manager. **Recommended.**
- **User OAuth with `ads_management`** — simpler onboarding, but the token dies when they
  change password or revoke, and it requires Meta App Review for advanced access.

Either way you are custodying credentials that can spend money. That is a security
obligation: envelope-encrypted token vault (KMS), per-tenant key separation, token refresh
monitoring, scope minimisation, full audit log, and a clear DPA. Underestimating this is the
most common way a platform like this becomes a liability rather than an asset.
