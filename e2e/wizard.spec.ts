/**
 * End-to-end check of the release wizard against a local stub standing in for Odesli.
 *
 *   npm run stub &
 *   ODESLI_BASE_URL=http://127.0.0.1:4010 ALLOW_LOCAL_FETCH=1 npm start
 *   npm run e2e:wizard
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN_HOST = process.env.ADMIN_HOST ?? 'admin.localhost';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'hunter2';
const ADMIN = BASE.replace('localhost', ADMIN_HOST);
const PUBLIC = BASE.replace('localhost', process.env.PROJECT_HOST ?? 'nightdrive.test');

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}`);
  if (!condition) failures++;
}

const browser = await chromium.launch({
  // Resolve the project's own domain locally, rather than depending on /etc/hosts.
  args: ['--no-sandbox', '--host-resolver-rules=MAP *.test 127.0.0.1'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage();

await page.goto(`${ADMIN}/admin/login`);
await page.fill('#password', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(`${ADMIN}/admin`);

await page.click('text=Nightdrive');
await page.waitForURL(/\/admin\/projects\//);
await page.click('text=Create from a streaming link');
await page.waitForURL(/\/admin\/projects\/.*\/new/);

// --- a URL the resolver cannot match -------------------------------------
await page.fill('#lookupUrl', 'https://open.spotify.com/album/unknown');
await page.click('text=Look up release');
await page.waitForSelector('.err');
check('an unresolvable link reports an error', (await page.textContent('.err'))!.length > 0);

// --- the happy path ------------------------------------------------------
await page.fill('#lookupUrl', 'https://open.spotify.com/album/4aTestAlbumId');
await page.click('text=Look up release');
await page.waitForSelector('#wTitle');

check('title is imported', (await page.inputValue('#wTitle')) === 'The Violet Hour (Deluxe)');
check('artist becomes the subtitle', (await page.inputValue('#wSubtitle')) === 'Nightdrive');
check('slug is derived from the title', (await page.inputValue('#wSlug')) === 'the-violet-hour-deluxe');
check('cover art previews', await page.isVisible('.found-art'));

const swatches = await page.locator('.swatch').count();
check(`palette is sampled from the artwork (${swatches} swatches)`, swatches > 0);

const accentPill = (await page.locator('.palette .pill').first().textContent()) ?? '';
check(`accent is magenta-ish, not the black or white in the cover (${accentPill.trim()})`,
  /^#[0-9a-f]{6}/i.test(accentPill.trim()) && (() => {
    const hex = accentPill.trim().slice(0, 7).toLowerCase();
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return r > g && b > g; // magenta: red and blue both above green
  })());

const linkCount = await page.locator('.rows li').count();
check(`every platform the resolver returned is listed (${linkCount})`, linkCount === 8);

// Deselect one, so we also prove the choice is respected.
await page.locator('.rows li').filter({ hasText: 'Amazon Music' }).locator('input[type=checkbox]').uncheck();
check('deselecting updates the count', (await page.textContent('h2:has-text("of 8 links")'))!.startsWith('7'));

await page.click('text=Create release');
await page.waitForURL(/\/admin\/releases\//);
check('release is created', await page.isVisible('text=The Violet Hour (Deluxe)'));

const destinations = await page.locator('.rows li').filter({ hasText: 'clicks / 30d' }).count();
check(`only the selected links were saved (${destinations})`, destinations === 7);
check('artwork palette is shown on the release', await page.isVisible('text=light #'));

// --- the public page -----------------------------------------------------
await page.goto(`${PUBLIC}/the-violet-hour-deluxe`);
const artSrc = await page.getAttribute('.artwork', 'src');
check(`artwork is served from our own domain (${artSrc})`, !!artSrc?.startsWith('/artwork/'));

const artOk = await page.evaluate(async (src) => {
  const res = await fetch(src!);
  return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
}, artSrc);
check('stored artwork is served', artOk);

const cta = await page.locator('.dsp-cta').first();
const ctaColour = await cta.evaluate((el) => getComputedStyle(el).color);
check(`page is coloured from the artwork (${ctaColour})`, ctaColour !== 'rgb(14, 92, 82)');

await browser.close();
console.log(failures === 0 ? '\nAll wizard checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
