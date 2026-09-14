/**
 * Check the live link resolver, which the test suite only exercises against a stub.
 *
 *   npm run resolve:check -- https://open.spotify.com/album/...
 *
 * Prints exactly what Odesli returns for a real release, so any difference between
 * their live response and the documented shape shows up here rather than mid-campaign.
 */
import { resolveStreamingUrl } from '../src/lib/resolve.ts';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npm run resolve:check -- <streaming url>');
  process.exit(1);
}

try {
  const r = await resolveStreamingUrl(url);
  console.log(`\nTitle      ${r.title ?? '(none returned)'}`);
  console.log(`Artist     ${r.artistName ?? '(none returned)'}`);
  console.log(`Artwork    ${r.thumbnailUrl ?? '(none returned)'}`);
  console.log(`\n${r.links.length} platforms:`);
  for (const l of r.links) console.log(`  ${l.dsp.padEnd(16)} ${l.url}`);
  if (!r.title) console.log('\nNo title came back — the wizard would leave that field blank.');
  if (!r.thumbnailUrl) console.log('No artwork came back — the release would be created without a cover.');
  console.log();
} catch (err) {
  console.error(`\nFailed: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
