/**
 * `src/data/gear.json` / `src/data/glossary.json` に記載された相互リンク(#70・#294)が、
 * 実際にはどの動画・ガジェットからも参照されず孤立している項目を検知する(#344)。
 *
 * 設計方針:
 * - `scripts/check-links.ts`(#254)・`scripts/check-fetch-freshness.ts`(#201)と同じ
 *   「サイレントな劣化を Issue 通知で可視化する」設計方針を踏襲する。ただし対象は
 *   外部リンクの死活・取得停滞ではなく、サイト内クロスリンクの充足性。
 * - `resolveGearVideos` / `resolveGlossaryVideos` / `resolveGlossaryGear`
 *   (src/lib/gear.ts・src/lib/glossary.ts)は「存在しない ID/名称は無視する」設計
 *   (手動管理データのため typo で throw させない方針)であり、その結果として
 *   「リンク先が1件も解決できない」項目が発生していても気づく手段が無い。
 * - 既存データ(gear.json / glossary.json)は自動編集しない。検知結果を
 *   コンソール出力 + GitHub Actions の `$GITHUB_OUTPUT` に書き出すのみ。
 * - 実行: `bun run scripts/check-cross-links.ts`
 */

import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type GearData,
  type GearItem,
  gearDisplayName,
  parseGearData,
  resolveGearVideos,
} from "../src/lib/gear";
import {
  type GlossaryData,
  type GlossaryItem,
  parseGlossaryData,
  resolveGlossaryGear,
  resolveGlossaryVideos,
} from "../src/lib/glossary";
import { parseVideosData, type Video } from "../src/lib/youtube";

const GEAR_JSON_PATH = fileURLToPath(new URL("../src/data/gear.json", import.meta.url));
const GLOSSARY_JSON_PATH = fileURLToPath(new URL("../src/data/glossary.json", import.meta.url));
const VIDEOS_JSON_PATH = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));

/**
 * どの動画からも参照されていない gear.json の項目を抽出する。
 * `videoIds` 自体が未設定・空配列の項目に加えて、`videoIds` は設定されているが
 * 全て videos.json 側に存在しない ID(削除・typo 等)の項目も対象に含む
 * (`resolveGearVideos` はどちらのケースも同じく空配列を返すため区別できないが、
 * どちらも「動画からの導線が実質存在しない」という観点では同じ問題のため、まとめて扱う)。
 */
export function findOrphanedGearItems(gear: GearData, videos: readonly Video[]): GearItem[] {
  return gear.items.filter((item) => resolveGearVideos(item, videos).length === 0);
}

/**
 * 動画・愛用ガジェットのどちらからも参照されていない glossary.json の項目を抽出する。
 * `resolveGearVideos` と同様、参照先IDが1件も解決できないケース(未設定含む)を対象にする。
 */
export function findOrphanedGlossaryItems(
  glossary: GlossaryData,
  videos: readonly Video[],
  gearItems: readonly GearItem[],
): GlossaryItem[] {
  return glossary.items.filter(
    (item) =>
      resolveGlossaryVideos(item, videos).length === 0 &&
      resolveGlossaryGear(item, gearItems).length === 0,
  );
}

export interface CrossLinkReport {
  hasOrphans: boolean;
  orphanedGearCount: number;
  orphanedGlossaryCount: number;
  /** GitHub Issue 本文にそのまま使える Markdown 形式のサマリ */
  summary: string;
}

/** 孤立項目の検知結果から、Issue 通知に使うレポートを組み立てる(純粋関数) */
export function buildCrossLinkReport(
  orphanedGear: readonly GearItem[],
  orphanedGlossary: readonly GlossaryItem[],
): CrossLinkReport {
  const hasOrphans = orphanedGear.length > 0 || orphanedGlossary.length > 0;
  const lines: string[] = [];
  if (orphanedGear.length > 0) {
    lines.push(
      `**愛用ガジェット(gear.json)**: どの動画からも参照されていない項目が ${orphanedGear.length} 件あります。`,
      ...orphanedGear.map((item) => `- ${gearDisplayName(item)}`),
      "",
    );
  }
  if (orphanedGlossary.length > 0) {
    lines.push(
      `**用語集(glossary.json)**: 動画・愛用ガジェットのどちらからも参照されていない項目が ${orphanedGlossary.length} 件あります。`,
      ...orphanedGlossary.map((item) => `- ${item.term}`),
      "",
    );
  }

  const summary = hasOrphans
    ? lines.join("\n").trimEnd()
    : "gear.json / glossary.json のクロスリンクに孤立した項目はありませんでした。";

  return {
    hasOrphans,
    orphanedGearCount: orphanedGear.length,
    orphanedGlossaryCount: orphanedGlossary.length,
    summary,
  };
}

async function writeGitHubOutput(report: CrossLinkReport): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log("[check-cross-links] GITHUB_OUTPUT 未設定のため標準出力のみに結果を表示します");
    return;
  }
  const lines = [
    `has_orphans=${report.hasOrphans}`,
    `orphaned_gear_count=${report.orphanedGearCount}`,
    `orphaned_glossary_count=${report.orphanedGlossaryCount}`,
    // summary は改行を含むため GitHub Actions のマルチライン出力構文(delimiter)を使う
    // (check-links.ts と同じパターン)
    "summary<<CHECK_CROSS_LINKS_SUMMARY_EOF",
    report.summary,
    "CHECK_CROSS_LINKS_SUMMARY_EOF",
    "",
  ].join("\n");
  await appendFile(outputPath, lines);
}

async function main(): Promise<void> {
  const gear = parseGearData(await Bun.file(GEAR_JSON_PATH).json());
  const glossary = parseGlossaryData(await Bun.file(GLOSSARY_JSON_PATH).json());
  const { videos } = parseVideosData(await Bun.file(VIDEOS_JSON_PATH).json());

  const orphanedGear = findOrphanedGearItems(gear, videos);
  const orphanedGlossary = findOrphanedGlossaryItems(glossary, videos, gear.items);
  const report = buildCrossLinkReport(orphanedGear, orphanedGlossary);

  console.log(`[check-cross-links] ${report.summary}`);
  await writeGitHubOutput(report);
}

// import.meta.main は直接実行時のみ true(テストからの import 時は false。fetch-videos.ts と同様)
if (import.meta.main) {
  await main();
}

export { main };
