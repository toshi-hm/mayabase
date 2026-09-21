import { categorizeVideo } from "./categories";
import type { Video } from "./youtube";

/**
 * 情報の鮮度に注意が必要とみなす経過月数(#452)。
 * AI・テック系動画(categorizeVideo が "ai" と判定するもの)はツール側のUI・機能変更が
 * 頻繁なジャンルのため、この期間を超えて経過した動画には注記を出す。
 */
const STALE_THRESHOLD_MONTHS = 12;

/**
 * 動画が「古いAI系動画」(category === "ai" かつ公開から STALE_THRESHOLD_MONTHS ヶ月以上経過)か判定する(#452)。
 * 初見訪問者が検索経由で古いAI系動画に着地し、古い操作方法のまま実践して失敗する事態を防ぐための
 * 注記表示の要否に使う。不正な publishedAt は判定不能として false を返す。
 */
export function isStaleAiVideo(video: Pick<Video, "title" | "publishedAt">, now: Date): boolean {
  if (categorizeVideo(video) !== "ai") return false;
  const publishedTime = Date.parse(video.publishedAt);
  if (Number.isNaN(publishedTime)) return false;
  // 「12ヶ月」は月によって日数が異なるため、日数固定(365日等)ではなく
  // Date の月演算(setMonth)で暦月単位の閾値日時を求める。
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - STALE_THRESHOLD_MONTHS);
  return publishedTime <= threshold.getTime();
}

/**
 * 指定動画と同カテゴリの動画から、公開日がより新しいものを1本(最新のもの)選ぶ(#452)。
 * 該当する動画が無ければ null を返す。
 */
export function findNewerVideoInSameCategory(
  video: Pick<Video, "id" | "title" | "publishedAt">,
  videos: readonly Video[],
): Video | null {
  const category = categorizeVideo(video);
  const publishedTime = Date.parse(video.publishedAt);
  if (Number.isNaN(publishedTime)) return null;

  let newest: Video | null = null;
  let newestTime = Number.NEGATIVE_INFINITY;
  for (const candidate of videos) {
    if (candidate.id === video.id) continue;
    if (categorizeVideo(candidate) !== category) continue;
    const candidateTime = Date.parse(candidate.publishedAt);
    if (Number.isNaN(candidateTime) || candidateTime <= publishedTime) continue;
    if (candidateTime > newestTime) {
      newestTime = candidateTime;
      newest = candidate;
    }
  }
  return newest;
}

/**
 * 動画詳細ページの「情報の公開時期」注記に使う、案内先の新しい動画を求める(#452)。
 * 対象動画が古いAI系動画でない場合、または同カテゴリ内により新しい動画が無い場合は null を返し、
 * 呼び出し側はセクション自体を非表示にする(getRelatedVideos 等と同じ「該当なしなら非表示」方針)。
 */
export function findAiFreshnessNoticeVideo(
  video: Pick<Video, "id" | "title" | "publishedAt">,
  videos: readonly Video[],
  now: Date,
): Video | null {
  if (!isStaleAiVideo(video, now)) return null;
  return findNewerVideoInSameCategory(video, videos);
}
