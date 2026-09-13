/** Unit check: sampled accents must stay readable on both page backgrounds. */
import sharp from 'sharp';
import { extractPalette, contrast } from '../src/lib/palette.ts';

const LIGHT_BG = '#f5f6f5';
const DARK_BG = '#0d1312';

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}`);
  if (!condition) failures++;
}

async function solid(hex: string): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: hex } })
    .jpeg()
    .toBuffer();
}

// Pale yellow and deep navy are the two cases a naive sampler gets wrong: one disappears
// on a light page, the other on a dark one.
for (const [name, hex] of [
  ['pale yellow', '#f7e9a0'],
  ['deep navy', '#101a3a'],
  ['mid magenta', '#c0267a'],
] as const) {
  const palette = await extractPalette(await solid(hex));
  check(
    `${name}: accent readable on the light page (${palette.accentLight})`,
    contrast(palette.accentLight, LIGHT_BG) >= 4.5,
  );
  check(
    `${name}: accent readable on the dark page (${palette.accentDark})`,
    contrast(palette.accentDark, DARK_BG) >= 4.5,
  );
}

// Greyscale artwork must not have a hue invented for it.
const greyPalette = await extractPalette(await solid('#8b8f8c'));
check(`greyscale artwork gets a neutral accent (${greyPalette.accentLight})`, greyPalette.neutral);
check(
  'neutral accent is still readable on the light page',
  contrast(greyPalette.accentLight, LIGHT_BG) >= 4.5,
);
check(
  'neutral accent is still readable on the dark page',
  contrast(greyPalette.accentDark, DARK_BG) >= 4.5,
);

// A cover that is mostly black and white with one strong colour: the colour should win.
const mixed = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#0a0a0a' } })
  .composite([
    { input: await sharp({ create: { width: 300, height: 120, channels: 3, background: '#ffffff' } }).png().toBuffer(), top: 0, left: 0 },
    { input: await sharp({ create: { width: 140, height: 140, channels: 3, background: '#1f7ae0' } }).png().toBuffer(), top: 130, left: 80 },
  ])
  .jpeg()
  .toBuffer();
const mixedPalette = await extractPalette(mixed);
const [, , b] = [1, 2, 3]; // readability
const hex = mixedPalette.accentLight.toLowerCase();
const blueish = parseInt(hex.slice(5, 7), 16) > parseInt(hex.slice(1, 3), 16);
check(`monochrome cover with one colour picks the colour (${mixedPalette.accentLight})`, blueish);

console.log(failures === 0 ? '\nAll palette checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
