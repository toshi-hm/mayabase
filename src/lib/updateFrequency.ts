import type { Video } from "./youtube";

/** 算出に使う直近動画本数の上限(古すぎるデータで実態と乖離しないよう直近のみを見る) */
const SAMPLE_SIZE = 12;
/** 算出に必要な最小間隔数(=動画本数-1)。これ未満は「傾向」として提示しない */
const MIN_INTERVALS = 4;
/** 間隔の中央値がこれを超える(おおよそ月1本未満のペース)場合は更新頻度として訴求しない */
const MAX_MEDIAN_INTERVAL_DAYS = 30;
/** 間隔のばらつき(p75 / p25)がこれを超える場合は「不規則」とみなし表示しない */
const MAX_IRREGULARITY_RATIO = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 線形補間によるパーセンタイル算出(sorted は昇順ソート済みであること) */
function percentile(sorted: readonly number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sorted[lower] as number;
  if (lower === upper) return lowerValue;
  const upperValue = sorted[upper] as number;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

/**
 * 直近の公開間隔から更新頻度の目安を算出する(#187)。
 * 中央値(p50)を基準に採否を判定し、p25/p75 を使って「週2〜3本」のような幅で提示することで、
 * 単発の外れ値(まとめ公開・長期休止等)に引きずられにくくする。
 * データ不足・更新ペースが低すぎる・間隔が不規則、のいずれかに該当する場合は null を返し、
 * 呼び出し側でセクションごと非表示にする(channelStats と同じフォールバック方針)。
 */
export function computeUpdateFrequencyLabel(
  videos: readonly Pick<Video, "publishedAt">[],
): string | null {
  const times = videos
    .map((v) => Date.parse(v.publishedAt))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)
    .slice(0, SAMPLE_SIZE);

  const intervalDays: number[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const days = ((times[i] as number) - (times[i + 1] as number)) / DAY_MS;
    if (days > 0) intervalDays.push(days);
  }
  if (intervalDays.length < MIN_INTERVALS) return null;

  const sorted = [...intervalDays].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  if (median > MAX_MEDIAN_INTERVAL_DAYS) return null;

  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  if (p25 <= 0 || p75 / p25 > MAX_IRREGULARITY_RATIO) return null;

  // 間隔が短い(p25)ほど頻度は高くなる
  const fastPerWeek = 7 / p25;
  const slowPerWeek = 7 / p75;

  if (slowPerWeek >= 1) {
    return formatRange(Math.round(slowPerWeek), Math.round(fastPerWeek), "週");
  }
  const daysPerMonth = 30;
  const fastPerMonth = fastPerWeek * (daysPerMonth / 7);
  const slowPerMonth = slowPerWeek * (daysPerMonth / 7);
  return formatRange(Math.round(slowPerMonth), Math.round(fastPerMonth), "月");
}

function formatRange(min: number, max: number, unit: "週" | "月"): string {
  const lo = Math.max(1, min);
  const hi = Math.max(lo, max);
  return lo === hi ? `${unit}${lo}本更新` : `${unit}${lo}〜${hi}本更新`;
}
