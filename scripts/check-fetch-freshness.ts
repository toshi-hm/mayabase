/**
 * `bun run fetch` 実行後に videos.json / channel-stats.json の鮮度を検証し、
 * 「沈黙的な取得失敗」(exit 0 のまま既存データが更新され続けない状態)を検知する(#201)。
 *
 * 設計方針:
 * - `scripts/fetch-videos.ts` は取得に失敗しても既存データを残して exit 0 する
 *   (docs/02-design.md 3.2節)。これは意図的な設計であり、本スクリプトもその方針を
 *   壊さない ―― 鮮度判定の結果に関わらず必ず exit 0 する。
 * - 判定材料は videos.json の `fetchedAt` のみを使う。channel-stats.json は
 *   YOUTUBE_API_KEY 未設定時は一度も更新されず fetchedAt が恒常的に null/古いままになり得るため
 *   (RSS 経路では更新されない)、単独では「取得が止まっている」の判定材料として使えない。
 *   videos.json は API 経路・RSS 経路のどちらが成功しても更新されるため、
 *   パイプライン全体の生存確認として最も信頼できる。
 * - 実行: `bun run scripts/check-fetch-freshness.ts`
 *   GitHub Actions の `$GITHUB_OUTPUT` に `stale` (true/false) と `summary` を書き出す。
 *   ローカル実行等で `$GITHUB_OUTPUT` が無い場合は標準出力へ結果を表示するのみ。
 */
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseVideosData } from "../src/lib/youtube";

const VIDEOS_JSON_PATH = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));

/** 3日連続失敗相当(72時間)を「沈黙的な取得失敗」とみなす閾値(#201) */
export const STALE_THRESHOLD_HOURS = 72;

export interface FreshnessResult {
  stale: boolean;
  /** fetchedAt が存在しない(一度も取得成功していない)場合は null */
  hoursSinceFetch: number | null;
  fetchedAt: string | null;
  summary: string;
}

/**
 * videos.json の `fetchedAt` と現在時刻を比較し、鮮度を判定する。
 * `fetchedAt` が null / 不正な日時の場合も stale 扱いにする(一度も取得できていない ≒ 沈黙的失敗)。
 */
export function evaluateFreshness(
  fetchedAt: string | null,
  now: Date = new Date(),
  thresholdHours: number = STALE_THRESHOLD_HOURS,
): FreshnessResult {
  const parsed = fetchedAt === null ? Number.NaN : Date.parse(fetchedAt);
  if (Number.isNaN(parsed)) {
    return {
      stale: true,
      hoursSinceFetch: null,
      fetchedAt: null,
      summary: `videos.json の fetchedAt が存在しないか不正です(値: ${fetchedAt ?? "null"})。動画データが一度も正常に取得できていない可能性があります。`,
    };
  }

  const hoursSinceFetch = (now.getTime() - parsed) / (1000 * 60 * 60);
  const stale = hoursSinceFetch > thresholdHours;
  const roundedHours = Math.round(hoursSinceFetch * 10) / 10;
  return {
    stale,
    hoursSinceFetch: roundedHours,
    fetchedAt,
    summary: stale
      ? `videos.json の最終取得(${fetchedAt})から ${roundedHours} 時間経過しており、閾値(${thresholdHours} 時間)を超えています。動画データの自動取得が連日サイレントに失敗している可能性があります。`
      : `videos.json は ${roundedHours} 時間前(${fetchedAt})に取得済みで、閾値(${thresholdHours} 時間)以内です。`,
  };
}

async function loadFetchedAt(): Promise<string | null> {
  try {
    const file = Bun.file(VIDEOS_JSON_PATH);
    if (!(await file.exists())) return null;
    return parseVideosData(await file.json()).fetchedAt;
  } catch (error) {
    console.warn(
      "[check-fetch-freshness] videos.json の読み込みに失敗しました(不正なデータとして stale 扱いにします):",
      error,
    );
    return null;
  }
}

async function writeGitHubOutput(result: FreshnessResult): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log("[check-fetch-freshness] GITHUB_OUTPUT 未設定のため標準出力のみに結果を表示します");
    return;
  }
  const lines = [
    `stale=${result.stale}`,
    `fetched_at=${result.fetchedAt ?? ""}`,
    `hours_since_fetch=${result.hoursSinceFetch ?? ""}`,
    // summary は改行を含まないため単純な key=value で十分だが、将来的な変更に備えて
    // GitHub Actions のマルチライン出力構文(delimiter)を使う
    "summary<<FRESHNESS_SUMMARY_EOF",
    result.summary,
    "FRESHNESS_SUMMARY_EOF",
    "",
  ].join("\n");
  await appendFile(outputPath, lines);
}

async function main(): Promise<void> {
  const fetchedAt = await loadFetchedAt();
  const result = evaluateFreshness(fetchedAt);
  console.log(`[check-fetch-freshness] ${result.summary}`);
  await writeGitHubOutput(result);
}

// import.meta.main は直接実行時のみ true(テストからの import 時は false。fetch-videos.ts と同様)
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // 鮮度チェック自体の失敗でワークフローを落とさない(既存の fetch-videos.ts と同じ方針)
    console.warn("[check-fetch-freshness] 鮮度チェックでエラーが発生しました:", error);
  }
}

export { main };
