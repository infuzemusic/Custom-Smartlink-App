/**
 * End-to-end check of the admin, driven through a real browser because Next's server
 * action wire format is not meaningfully reproducible with a plain HTTP client.
 *
 *   ADMIN_HOST=admin.localhost ADMIN_PASSWORD=... npm run e2e
 *
 * Expects the app already running on BASE_URL with a migrated database.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN_HOST = process.env.ADMIN_HOST ?? 'admin.localhost';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'hunter2';
const ADMIN = BASE.replace('localhost', ADMIN_HOST);

/** Each form keeps its own error state, so assertions must be scoped to one card. */
function cardWith(page: import('playwright').Page, selector: string) {
  return page.locator('.card', { has: page.locator(selector) });
}

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}`);
  if (!condition) failures++;
}

// CHROMIUM_PATH lets this run against a preinstalled browser whose build number does
// not match the installed Playwright package.
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage();

// --- sign in -------------------------------------------------------------
await page.goto(`${ADMIN}/admin`);
check('unauthenticated admin redirects to login', page.url().includes('/admin/login'));

await page.fill('#password', 'wrong-password');
await page.click('button[type=submit]');
await page.waitForSelector('.err');
check('wrong password is rejected', (await page.textContent('.err'))!.includes('Incorrect'));

await page.fill('#password', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(`${ADMIN}/admin`);
check('correct password signs in', await page.isVisible('text=New project'));

// --- create a project ----------------------------------------------------
const slug = `e2e-${Date.now().toString(36)}`;
await page.fill('#name', 'E2E Project');
await page.fill('#slug', slug);
await page.click('text=Create project');
await page.waitForURL(/\/admin\/projects\//);
check('creating a project opens its page', await page.isVisible('text=E2E Project'));
const projectUrl = page.url();

// --- domains -------------------------------------------------------------
await page.fill('#hostname', `${slug}.example`);
await page.click('text=Add domain');
await page.waitForSelector(`text=${slug}.example`);
check('domain is added and marked primary', await page.isVisible('.pill.ok'));

await page.fill('#hostname', 'nightdrive.test'); // already owned by a seeded project
await page.click('text=Add domain');
const domainErr = cardWith(page, '#hostname').locator('.err');
await domainErr.waitFor();
check('a hostname already in use is refused', (await domainErr.textContent())!.includes('already pointed'));

// --- tracking ------------------------------------------------------------
await page.fill('#metaPixelId', '123456789012345');
await page.fill('#capiTokenRef', 'EAAG-this-is-a-token-not-a-name');
await page.click('text=Save tracking');
const trackingErr = cardWith(page, '#capiTokenRef').locator('.err');
await trackingErr.waitFor();
check(
  'pasting a token where a variable name belongs is refused',
  (await trackingErr.textContent())!.includes('environment variable NAME'),
);

await page.fill('#capiTokenRef', `META_CAPI_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`);
await page.click('text=Save tracking');
await page.waitForSelector('text=missing in this environment');
check('a token env var that is not set is flagged', true);

// --- releases and destinations -------------------------------------------
await page.goto(projectUrl);
// The by-hand form sits behind a disclosure now that the wizard is the main path.
await page.click('summary:has-text("Or add one by hand")');
await page.fill('#title', 'E2E Single');
await page.fill('#slug', 'e2e-single');
await page.click('text=Add release');
await page.waitForURL(/\/admin\/releases\//);
check('creating a release opens its page', await page.isVisible('text=E2E Single'));

await page.fill('#dsp', 'spotify');
// A valid URL as far as the browser is concerned, so this reaches the server check.
await page.fill('#url', 'ftp://example.com/track');
await page.click('text=Save destination');
const destErr = cardWith(page, '#dsp').locator('.err');
await destErr.waitFor();
check('a non-http destination URL is refused', (await destErr.textContent())!.includes('http'));

// After a validation error the form must still hold what was typed, or the retry
// submits empty fields. Only the URL is corrected here, deliberately.
check('fields survive a validation error', (await page.inputValue('#dsp')) === 'spotify');
await page.fill('#url', 'https://open.spotify.com/track/e2e');
await page.click('text=Save destination');
await page.waitForSelector('text=open.spotify.com/track/e2e');
check('destination is saved', true);

await page.fill('#isrc', 'GBAAA0000001');
await page.click('text=Save release');
await page.waitForTimeout(600);
await page.reload();
check('ISRC persists', (await page.inputValue('#isrc')) === 'GBAAA0000001');

// --- deletion cleans up --------------------------------------------------
page.once('dialog', (d) => d.accept());
await page.click('text=Delete this release');
await page.waitForURL(/\/admin\/projects\//);
check('deleting a release returns to its project', !(await page.isVisible('text=E2E Single')));

page.once('dialog', (d) => d.accept());
await page.click('text=Delete this project');
await page.waitForURL(`${ADMIN}/admin`);
// Assert on the run-unique hostname, not the shared display name: a previous failed
// run may have left a project with the same name behind.
check('deleting a project removes it from the list', !(await page.isVisible(`text=${slug}.example`)));

// --- sign out ------------------------------------------------------------
await page.click('text=Sign out');
await page.waitForURL(/\/admin\/login/);
await page.goto(`${ADMIN}/admin`);
check('signing out ends the session', page.url().includes('/admin/login'));

await browser.close();
console.log(failures === 0 ? '\nAll admin checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
