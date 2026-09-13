/** Odesli platform key -> our DSP slug. Order here is the order links are shown in. */
export const ODESLI_PLATFORMS: Array<[odesliKey: string, dsp: string]> = [
  ['spotify', 'spotify'],
  ['appleMusic', 'apple-music'],
  ['itunes', 'itunes'],
  ['youtubeMusic', 'youtube-music'],
  ['youtube', 'youtube'],
  ['amazonMusic', 'amazon-music'],
  ['tidal', 'tidal'],
  ['deezer', 'deezer'],
  ['soundcloud', 'soundcloud'],
  ['bandcamp', 'bandcamp'],
  ['audiomack', 'audiomack'],
  ['audius', 'audius'],
  ['anghami', 'anghami'],
  ['boomplay', 'boomplay'],
  ['pandora', 'pandora'],
  ['napster', 'napster'],
  ['yandex', 'yandex'],
];

const LABELS: Record<string, string> = {
  spotify: 'Spotify',
  'apple-music': 'Apple Music',
  itunes: 'iTunes',
  'youtube-music': 'YouTube Music',
  youtube: 'YouTube',
  'amazon-music': 'Amazon Music',
  tidal: 'Tidal',
  deezer: 'Deezer',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  audiomack: 'Audiomack',
  audius: 'Audius',
  anghami: 'Anghami',
  boomplay: 'Boomplay',
  pandora: 'Pandora',
  napster: 'Napster',
  yandex: 'Yandex Music',
  beatport: 'Beatport',
};

export function dspLabel(dsp: string): string {
  return LABELS[dsp] ?? dsp.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
