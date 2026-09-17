/**
 * `videos.json` から投稿ペース(#454)を算出し、投稿停滞を運営者向けの Issue 通知で
 * 顕在化する(#460)。
 *
 * 設計方針:
 * - 当初 #454 は index.astro のトップページに「投稿間隔が空いています」を直接描画していたが、
 *   運営者向けの意図に反して全訪問者に表示されてしまっていた(#460)。
 *   `scripts/check-fetch-freshness.ts`(#201)・`scripts/check-links.ts`(#254)と同じ
 *   「サイレントな異常を Issue 通知で顕在化する」設計に揃え、表示先をポータルから
 *   GitHub Issue に変更する。
 * - 判定ロジック自体は `src/lib/postingCadence.ts` の `computePostingCadence` をそのまま使う。
 * - 実行: `bun run scripts/check-posting-cadence.ts`
 *   GitHub Actions の `$GITHUB_OUTPUT` に `stagnant`(true/false)・`summary` を書き出す。
 *   ローカル実行等で `$GITHUB_OUTPUT` が無い場合は標準出力へ結果を表示するのみ。
 */
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { formatGitHubMultilineOutput } from "../src/lib/githubOutput";
import { computePostingCadence, type PostingCadence } from "../src/lib/postingCadence";
import { parseVideosData } from "../src/lib/youtube";

const VIDEOS_JSON_PATH = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));

export interface PostingCadenceCheckResult {
  stagnant: boolean;
  cadence: PostingCadence | null;
  summary: string;
}

/** `computePostingCadence` の結果から Issue 通知に使うサマリを組み立てる(純粋関数) */
export function buildSummary(cadence: PostingCadence | null): PostingCadenceCheckResult {
  if (cadence === null) {
    return {
      stagnant: false,
      cadence,
      summary: "動画データが無いため投稿ペースを算出できません。",
    };
  }
  const { daysSinceLatestLong, recentLongCount, recentShortCount, isStagnant } = cadence;
  const elapsed =
    daysSinceLatestLong !== null
      ? `最新の長尺投稿から${daysSinceLatestLong}日経過`
      : "長尺投稿がまだありません";
  const summary = `${elapsed}。直近30日の投稿本数: 長尺${recentLongCount}本・Shorts${recentShortCount}本。`;
  return { stagnant: isStagnant, cadence, summary };
}

async function loadVideos() {
  const file = Bun.file(VIDEOS_JSON_PATH);
  if (!(await file.exists())) return [];
  return parseVideosData(await file.json()).videos;
}

async function writeGitHubOutput(result: PostingCadenceCheckResult): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log("[check-posting-cadence] GITHUB_OUTPUT 未設定のため標準出力のみに結果を表示します");
    return;
  }
  const lines = formatGitHubMultilineOutput(
    { stagnant: result.stagnant },
    "summary",
    result.summary,
    "POSTING_CADENCE_SUMMARY",
  );
  await appendFile(outputPath, lines);
}

async function main(): Promise<void> {
  const videos = await loadVideos();
  const cadence = computePostingCadence(videos, new Date());
  const result = buildSummary(cadence);
  console.log(`[check-posting-cadence] ${result.summary}`);
  await writeGitHubOutput(result);
}

// import.meta.main は直接実行時のみ true(テストからの import 時は false。fetch-videos.ts と同様)
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // 投稿ペースチェック自体の失敗でワークフローを落とさない(check-fetch-freshness.ts と同じ方針)
    console.warn("[check-posting-cadence] 投稿ペースチェックでエラーが発生しました:", error);
  }
}

export { main };
