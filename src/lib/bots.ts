/**
 * Cheap bot screen, applied before any event is sent to Meta.
 *
 * Bot clicks inflate event counts, drag Event Match Quality down and train the
 * algorithm on traffic that will never convert. We still log these rows — flagged —
 * so the real and the filtered numbers can be compared.
 */
const BOT_UA =
  /bot|crawler|spider|crawling|facebookexternalhit|preview|slurp|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|monitor|scrapy|semrush|ahrefs|bingpreview|whatsapp|telegram|discord|embedly/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no UA at all is not a real browser
  return BOT_UA.test(userAgent);
}
