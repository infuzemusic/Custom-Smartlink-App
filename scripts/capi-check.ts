/**
 * Pre-flight the Conversions API without deploying anything.
 *
 * The Conversions API is an outbound call from your machine to Meta, so the whole
 * tracking path can be checked from localhost — no public URL, no DNS, no ad spend.
 *
 *   npm run capi:check -- --project nightdrive              print the payload only
 *   npm run capi:check -- --project nightdrive --send       send it as a test event
 *
 * Sending requires the project's pixel ID in the database, its CAPI token in the
 * environment, and a test event code (from Events Manager -> Test Events). The code
 * keeps these out of your real reporting.
 */
import { sql } from '../src/lib/db.ts';
import { buildEventPayload, capiEndpoint, newEventId } from '../src/lib/meta.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const send = args.includes('--send');
const slug = flag('project');
if (!slug) {
  console.error('Usage: npm run capi:check -- --project <slug> [--send]');
  process.exit(1);
}

const [project] = await sql<
  { name: string; pixel: string | null; token_ref: string | null; code_ref: string | null; host: string | null }[]
>`
  select p.name, t.meta_pixel_id as pixel, t.capi_token_ref as token_ref,
         t.test_event_code_ref as code_ref,
         (select hostname from domain d where d.project_id = p.id
           order by is_primary desc, hostname limit 1) as host
  from project p left join tracking t on t.project_id = p.id
  where p.slug = ${slug}
`;
if (!project) {
  console.error(`No project with slug "${slug}".`);
  process.exit(1);
}

const token = project.token_ref ? process.env[project.token_ref] : undefined;
const testCode = project.code_ref ? process.env[project.code_ref] : undefined;
const host = project.host ?? 'example.com';

console.log(`\nProject        ${project.name}`);
console.log(`Pixel          ${project.pixel ?? 'NOT SET — add it in the admin'}`);
console.log(`Token env var  ${project.token_ref ?? 'not set'} ${token ? '(present)' : '(MISSING in this environment)'}`);
console.log(`Test code var  ${project.code_ref ?? 'not set'} ${testCode ? '(present)' : '(missing)'}`);

// A realistic pair: one page view and one DSP click sharing nothing but the visitor.
// Each carries the event_id the browser pixel would have used for the same action.
const fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
const fbc = `fb.1.${Date.now()}.PAoY2TESTCLICKID`;
const events = [
  buildEventPayload({
    eventName: 'PageView',
    eventId: newEventId(),
    eventSourceUrl: `https://${host}/midnight-loop`,
    userData: { fbp, fbc, ip: '203.0.113.42', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', externalId: fbp },
  }),
  buildEventPayload({
    eventName: 'DspClick',
    eventId: newEventId(),
    eventSourceUrl: `https://${host}/out/midnight-loop/spotify`,
    userData: { fbp, fbc, ip: '203.0.113.42', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', externalId: fbp },
    customData: { content_name: 'midnight-loop', content_category: 'spotify' },
  }),
];

console.log('\n--- payload (access_token omitted) ---');
console.log(JSON.stringify({ data: events, ...(testCode ? { test_event_code: testCode } : {}) }, null, 2));

console.log('\nCheck before sending:');
console.log('  - fbp and fbc are NOT hashed. Hashing them breaks matching entirely.');
console.log('  - external_id IS hashed (64 hex chars).');
console.log('  - event_id is present on every event; the browser pixel must send the same value.');
console.log('  - event_source_url is the real page URL on the project\'s own domain.');

if (!send) {
  console.log('\nRun again with --send to deliver these as test events.');
  console.log('You can also paste the payload into Events Manager -> Payload Helper.\n');
  await sql.end();
  process.exit(0);
}

if (!project.pixel || !token) {
  console.error('\nCannot send: the pixel ID or the token is missing.\n');
  await sql.end();
  process.exit(1);
}
if (!testCode) {
  console.error('\nRefusing to send without a test event code — these would land in real reporting.');
  console.error(`Set ${project.code_ref ?? 'META_TEST_EVENT_CODE_<SLUG>'} to the code from Events Manager -> Test Events.\n`);
  await sql.end();
  process.exit(1);
}

let response: Response;
try {
  response = await fetch(capiEndpoint(project.pixel), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: events, access_token: token, test_event_code: testCode }),
  });
} catch (err) {
  // Distinguish "never reached Meta" from "Meta said no" — otherwise a proxy or DNS
  // problem sends you hunting for a payload bug that does not exist.
  console.error(`\nCould not reach ${capiEndpoint(project.pixel)}`);
  console.error(`${err instanceof Error ? err.message : err}`);
  console.error('This is a network problem, not a payload problem.\n');
  await sql.end();
  process.exit(1);
}
const body = await response.text();

// A failure is only a payload problem if Meta itself answered. A proxy, firewall or
// captive portal also returns an HTTP error, and reading that as a rejected field
// sends you hunting for a bug that is not in the payload.
let parsed: { error?: { message?: string; error_user_title?: string } } | null = null;
try {
  parsed = JSON.parse(body);
} catch {
  parsed = null;
}
const fromMeta = parsed !== null;

console.log(`\n--- responded ${response.status} ---`);
console.log(body);

if (response.ok) {
  console.log('\nNow open Events Manager -> Test Events. Both events should appear within a few seconds.');
  console.log('Check each shows once, not twice: that is deduplication working.\n');
} else if (fromMeta && parsed?.error) {
  console.log(`\nMeta rejected the payload: ${parsed.error.error_user_title ?? parsed.error.message ?? 'see above'}`);
  console.log('The message names the offending field.\n');
} else {
  console.log('\nThat response did not come from Meta — something between you and');
  console.log('graph.facebook.com answered instead (proxy, firewall, DNS).');
  console.log('This is a network problem, not a payload problem.\n');
}
await sql.end();
process.exit(response.ok ? 0 : 1);
