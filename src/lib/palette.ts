import sharp from 'sharp';

export type Palette = {
  /** Accent already corrected to read on the light page background. */
  accentLight: string;
  /** The same hue corrected to read on the dark page background. */
  accentDark: string;
  /** The colours actually sampled, most prominent first — shown in the wizard preview. */
  swatches: string[];
  /** True when the artwork carries no usable hue, so the accent is a neutral. */
  neutral: boolean;
};

const LIGHT_BG = '#f5f6f5';
const DARK_BG = '#0d1312';
const MIN_CONTRAST = 4.5; // WCAG AA for normal text

/* ------------------------------------------------------------ colour maths --- */

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

function luminance(hex: string): number {
  const [r, g, b] = fromHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Keep the hue, move the lightness until the colour is readable on `background`.
 *
 * Artwork colours are chosen to look good against each other, not against a page. Using
 * a sampled colour raw gives pale yellows that vanish on a light background and deep
 * navies that vanish on a dark one, so every accent gets corrected per theme.
 */
function correctForBackground(hex: string, background: string): string {
  const [h, s] = rgbToHsl(...fromHex(hex));
  const goingDarker = luminance(background) > 0.35;
  const saturation = Math.min(0.92, Math.max(0.35, s)); // keep some colour in greyish art

  let best = hex;
  let bestContrast = 0;
  for (let step = 0; step <= 100; step++) {
    const l = goingDarker ? 0.52 - step * 0.005 : 0.48 + step * 0.005;
    if (l < 0.04 || l > 0.97) break;
    const candidate = toHex(...hslToRgb(h, saturation, l));
    const c = contrast(candidate, background);
    if (c > bestContrast) { bestContrast = c; best = candidate; }
    if (c >= MIN_CONTRAST) return candidate; // first one that passes keeps most colour
  }
  return best;
}

/* ---------------------------------------------------------------- sampling --- */

type Bucket = { r: number; g: number; b: number; weight: number; count: number };

/**
 * Sample the dominant colours of an image.
 *
 * Buckets pixels by coarse hue and lightness, then scores each bucket by how much of the
 * image it covers *and* how colourful it is — otherwise the winner is almost always the
 * near-black or near-white that dominates most sleeve art.
 */
export async function extractPalette(image: Buffer): Promise<Palette> {
  const { data, info } = await sharp(image)
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, Bucket>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.06 || l > 0.95) continue;              // pure black/white carry no hue
    const key = `${Math.round(h * 18)}:${Math.round(l * 5)}:${s < 0.12 ? 'grey' : 'c'}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count += 1;
    // Colourfulness and mid-lightness both make a colour more usable as an accent.
    //
    // The lightness falloff is deliberately steep. A gentler one let a large near-black
    // region out-score a smaller vivid one on area alone, which left the ranking nearly
    // tied — so the winner flipped depending on whether the same artwork arrived as a
    // PNG or a JPEG. Discounting the extremes harder both matches what the eye picks out
    // and makes the result stable across encodings.
    bucket.weight += (0.25 + s) * Math.max(0, 1 - Math.abs(l - 0.5) * 1.8);
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()]
    .filter((x) => x.count >= 3)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((x) => toHex(x.r / x.count, x.g / x.count, x.b / x.count));

  const base = ranked[0] ?? '#0e5c52';

  // Monochrome artwork has no hue to borrow. Saturating the nearest near-grey invents a
  // colour that is not in the sleeve at all, which looks like a bug; a neutral accent
  // reads as a deliberate choice alongside black-and-white art.
  const [, baseSaturation] = rgbToHsl(...fromHex(base));
  if (baseSaturation < 0.12) {
    return { accentLight: '#2d3735', accentDark: '#cdd6d3', swatches: ranked, neutral: true };
  }

  return {
    accentLight: correctForBackground(base, LIGHT_BG),
    accentDark: correctForBackground(base, DARK_BG),
    swatches: ranked,
    neutral: false,
  };
}

/** Hex values reach the page inside a <style> block, so validate before emitting. */
export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
