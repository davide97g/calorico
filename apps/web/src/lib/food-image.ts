/**
 * Open Food Facts stores every photo at a few fixed widths — 100, 200, 400 and
 * `full`. Lists never show photos, so what we have on record is the small
 * variant; a detail page can ask for the bigger one from the same URL.
 */
export function foodImageLarge(url: string): string {
  return url.replace(/\.(100|200|400)\.jpg$/i, '.400.jpg')
}
