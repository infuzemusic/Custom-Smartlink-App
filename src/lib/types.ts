export type Project = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  theme: { accent?: string; background?: string; foreground?: string };
  profiles: Record<string, string>;
  metaPixelId: string | null;
  capiTokenRef: string | null;
  testEventCodeRef: string | null;
};

export type Destination = {
  id: string;
  dsp: string;
  url: string;
  region: string; // '*' = all regions
  sortOrder: number;
};

export type Palette = { accentLight: string; accentDark: string; swatches: string[] };

export type Release = {
  id: string;
  palette: Palette | null;
  slug: string;
  title: string;
  subtitle: string | null;
  artworkUrl: string | null;
  releaseAt: Date | null;
  destinations: Destination[];
};

/** A release is "live" once its release instant has passed (or it never had one). */
export function isLive(release: Pick<Release, 'releaseAt'>, now = new Date()): boolean {
  return release.releaseAt === null || release.releaseAt.getTime() <= now.getTime();
}
