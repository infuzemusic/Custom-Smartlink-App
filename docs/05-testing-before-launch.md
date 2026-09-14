# Testing before it goes online

Most of this needs no deployment. The key fact: **the Conversions API is an outbound
call from your machine to Meta**, so the tracking path can be checked from localhost with
no public URL, no DNS and no ad spend. Only the last stage needs money.

Work down the list. Each stage proves something the previous one could not.

---

## Stage 0 — Offline, now

```bash
npm run test:palette                      # colour sampling and contrast, no server
npm run stub &                            # stands in for api.song.link
npm run e2e && npm run e2e:wizard         # admin and wizard in a real browser
```

**Proves:** every page renders, the admin saves, the wizard resolves and creates, artwork
stores and serves, colours are sampled and corrected, an unknown host 404s, bot traffic is
filtered, and browser and server events share an `event_id`.

**Cannot prove:** that Meta accepts the payload, or that Odesli's live response matches
the shape the stub imitates. Those are stages 1 and 2.

---

## Stage 1 — The real link resolver (2 minutes, local)

```bash
npm run resolve:check -- https://open.spotify.com/album/<a real release of yours>
```

Prints exactly what Odesli returns: title, artist, artwork URL, every platform matched.

**Proves:** the one dependency the suite only stubs. Run it against two or three of your
own releases, including a single and an album — coverage differs.

**Watch for:** a missing title or artwork (the wizard leaves those blank rather than
failing), or fewer platforms than you expect, which usually means the release is new and
Odesli has not indexed everything yet.

---

## Stage 2 — The real Conversions API (10 minutes, local, no deployment)

In Events Manager, open **Test Events** and copy the test event code. Then:

```bash
export META_CAPI_TOKEN_NIGHTDRIVE='<system user token>'
export META_TEST_EVENT_CODE_NIGHTDRIVE='<code from Test Events>'

npm run capi:check -- --project nightdrive           # print the payload, send nothing
npm run capi:check -- --project nightdrive --send    # deliver as test events
```

The script refuses to send without a test event code, so this cannot touch real reporting.

**Proves:** Meta accepts your payload, your token works, your field mapping is right, and
the pixel ID is correct. This is the single highest-value check available before launch,
and it needs nothing online.

**Read the payload before sending.** `fbp` and `fbc` must be unhashed; `external_id` must
be 64 hex characters; every event must carry an `event_id`.

If it fails, the script distinguishes a Meta rejection (which names the offending field)
from a network problem (proxy, firewall, DNS) — they need completely different fixes.

---

## Stage 3 — Deduplication, in a real browser (local)

Put the real pixel ID and test event code in place, run the app locally, open a release
page and click through to a DSP. Watch Test Events while you do it.

**Proves:** the thing nothing else can — that a `PageView` and a `DspClick` each appear
**once**, not twice. Meta shows the browser and server copies collapsing into a single
deduplicated event.

Seeing each event twice means the `event_id` is not matching between the pixel and the
server, and double-counted conversions are worse than having no server events at all.

---

## Stage 4 — A temporary public URL (optional, 15 minutes)

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

**Proves:** what only a public URL can — the page on a real phone over real mobile
network, and Facebook's Sharing Debugger fetching your Open Graph tags so you can see the
link preview an ad will actually show.

**Note:** the tunnel hostname is not in the database, so it will 404 by design. Add it as a
domain on the project in the admin for the duration of the test, then remove it.

---

## Stage 5 — A staging domain (the first real deployment)

Deploy per `04-deploy.md`, but point it at a hostname you own and will never advertise —
`staging.yourhouse.com`. Use a **separate pixel** created for staging, not a project's real
one, so nothing you do here can affect a real dataset.

**Proves:** DNS, certificates, the container or platform build, migrations against a real
database, artwork serving at real latency, and the health check.

---

## Stage 6 — One real project, organic traffic only

Point one alias's real domain at it and use the link in a story or a post. No ad spend.

**Proves:** the whole path under real traffic, and gives you a first read on Event Match
Quality in Events Manager. Aim for 8+; below that, the usual cause is that few visitors
arrive with an `fbc`, which resolves itself once ad traffic starts.

---

## Stage 7 — The smallest possible ad test

One campaign, smallest budget your market allows, two days, pointed at that release page
with a custom conversion on the DSP click.

**Proves:** the only thing left — that clicks attribute back to the ad, which requires a
real ad click carrying a real `fbclid` through your domain to a real conversion. Nothing
short of spending money tests this.

**Check:** conversions reported in Ads Manager against the rows in your own `event` table
for the same window. They will not match exactly — Meta attributes across devices and
windows, and you count raw clicks — but they should be the same order of magnitude and
move together. A large gap in either direction means something in the chain is wrong.

---

## What the stages do not cover

- **Reputation isolation.** You cannot measure it directly; it shows up over months as
  ads that are not dragged down by other advertisers' behaviour. The structure is the
  guarantee, not a test.
- **Pre-save.** Not built, and not buildable for Spotify — see `00-solo-build.md`.
- **Load.** At one owner's traffic this will not be a constraint for a long time.
