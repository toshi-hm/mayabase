import type { Video } from "./youtube";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 直近本数の集計対象期間 */
const RECENT_WINDOW_DAYS = 30;
/** 最新の長尺投稿からこの日数以上空いている場合、投稿停滞の注意表示を出す */
const STAGNATION_THRESHOLD_DAYS = 14;

export interface PostingCadence {
  /** 最新の長尺投稿からの経過日数(JST の暦日差)。長尺が1本も無ければ null */
  daysSinceLatestLong: number | null;
  /** 直近30日に公開された長尺の本数 */
  recentLongCount: number;
  /** 直近30日に公開されたShortsの本数 */
  recentShortCount: number;
  /** 長尺投稿が STAGNATION_THRESHOLD_DAYS 日以上空いている場合 true */
  isStagnant: boolean;
}

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * JST の暦日単位で `from` → `to` の日数差を返す。
 * 単純なミリ秒差(/ 24時間)では時刻成分によって日付境界をまたぐ際にずれるため、
 * 両日時を JST の日付文字列に変換してから差を取る。
 */
function jstCalendarDayDiff(from: Date, to: Date): number {
  const fromDay = Date.parse(`${jstDateFormatter.format(from)}T00:00:00Z`);
  const toDay = Date.parse(`${jstDateFormatter.format(to)}T00:00:00Z`);
  return Math.round((toDay - fromDay) / DAY_MS);
}

/**
 * トップページ「最新動画」セクション向けに投稿ペースの目安を算出する(#454)。
 * 既存の `computeUpdateFrequencyLabel`(長尺・Shorts合算の週次/月次ペース)とは別に、
 * 運営者が投稿停滞にポータル上で気付けるよう「経過日数」と「直近30日の本数」を
 * 長尺/Shorts別に出す。`isShort !== true` を長尺として扱う点は index.astro の
 * `regularVideos` フィルタ(未判定は横動画として扱う)と揃えている。
 * 動画データが1件も無い場合は null を返し、呼び出し側でセクションごと非表示にする
 * (channelStats 等と同じ「取得できなければ非表示」の方針)。
 */
export function computePostingCadence(
  videos: readonly Pick<Video, "publishedAt" | "isShort">[],
  now: Date,
): PostingCadence | null {
  if (videos.length === 0) return null;

  const longTimes = videos
    .filter((v) => v.isShort !== true)
    .map((v) => Date.parse(v.publishedAt))
    .filter((t) => !Number.isNaN(t) && t <= now.getTime());
  const latestLongTime = longTimes.length > 0 ? Math.max(...longTimes) : null;
  const daysSinceLatestLong =
    latestLongTime === null ? null : jstCalendarDayDiff(new Date(latestLongTime), now);

  const windowStart = now.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
  let recentLongCount = 0;
  let recentShortCount = 0;
  for (const v of videos) {
    const t = Date.parse(v.publishedAt);
    if (Number.isNaN(t) || t < windowStart || t > now.getTime()) continue;
    if (v.isShort === true) {
      recentShortCount++;
    } else {
      recentLongCount++;
    }
  }

  return {
    daysSinceLatestLong,
    recentLongCount,
    recentShortCount,
    isStagnant: daysSinceLatestLong !== null && daysSinceLatestLong >= STAGNATION_THRESHOLD_DAYS,
  };
}
