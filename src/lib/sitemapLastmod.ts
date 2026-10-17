/** sitemap の lastmod 算出に必要な動画の最小情報 */
interface VideoDate {
  id: string;
  publishedAt: string;
}

/**
 * sitemap-0.xml の各URLに付与する lastmod(ISO 8601)を返す(#580)。
 * 根拠のある日付だけを出す方針で、次の場合のみ値を返し、それ以外は undefined(lastmod なし)。
 * - /videos/{id}/ : その動画の公開日時
 * - / と /videos/ : 全動画のうち最も新しい公開日時(新着動画の追加で内容が更新されるため)
 * 公開日時がパース不能な動画は無視する。
 */
export function sitemapLastmod(
  pageUrl: string,
  videos: readonly VideoDate[],
  siteUrl: string,
): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(pageUrl, siteUrl).pathname;
  } catch {
    return undefined;
  }

  const parsed = videos
    .map((video) => ({ id: video.id, time: Date.parse(video.publishedAt) }))
    .filter((video) => !Number.isNaN(video.time));

  const detail = pathname.match(/^\/videos\/([^/]+)\/$/);
  if (detail && detail[1] !== "category" && detail[1] !== "series") {
    const found = parsed.find((video) => video.id === decodeURIComponent(detail[1]));
    return found ? new Date(found.time).toISOString() : undefined;
  }

  if (pathname === "/" || pathname === "/videos/") {
    if (parsed.length === 0) return undefined;
    return new Date(Math.max(...parsed.map((video) => video.time))).toISOString();
  }
  return undefined;
}
