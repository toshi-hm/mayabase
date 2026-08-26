/**
 * `src/data/gear.json`・`src/data/faq.json` に含まれる外部リンク(Amazon アフィリエイトリンク・
 * メーカー公式サイト等)の死活監視(#254)。
 *
 * 設計方針:
 * - `scripts/check-fetch-freshness.ts`(#201)と同じ「サイレント障害を Issue 通知で顕在化する」
 *   設計思想を、対象を「動画データの取得停滞」から「リンク切れ」に変えて適用する。
 * - 各 URL は `src/lib/youtube.ts` の `probeIsShort` / `probeHqThumbnail` と同じ方針で
 *   HEAD リクエストを行い、HEAD 非対応(405 / 501)の場合のみ GET にフォールバックする。
 * - 実行: `bun run scripts/check-links.ts`
 *   GitHub Actions の `$GITHUB_OUTPUT` に `has_broken`(true/false)・`broken_count`・
 *   `total_count`・`summary` を書き出す。ローカル実行等で `$GITHUB_OUTPUT` が無い場合は
 *   標準出力へ結果を表示するのみ。
 * - `fetch-videos.ts`(動画データの取得)とは異なり、このスクリプト自体は「取得元データの更新」を
 *   行わないため、失敗時に既存データを残す配慮は不要。データ読み込み等の想定外エラーはそのまま
 *   throw し、ワークフローを失敗として可視化する(個々のリンクのチェック失敗は throw せず
 *   レポートに含める)。
 */
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type FaqData, isInternalPath, parseFaqData } from "../src/lib/faq";
import { type GearData, parseGearData } from "../src/lib/gear";
import { type FetchLike, mapWithConcurrency } from "../src/lib/youtube";

const GEAR_JSON_PATH = fileURLToPath(new URL("../src/data/gear.json", import.meta.url));
const FAQ_JSON_PATH = fileURLToPath(new URL("../src/data/faq.json", import.meta.url));
const CHECK_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15_000;

/** チェック対象のリンク 1 件。同一 URL が複数箇所から参照される場合は sources にまとめる */
export interface LinkTarget {
  url: string;
  /** 参照元ラベル(gear.json は「ブランド 製品名」、faq.json は質問文) */
  sources: string[];
}

/** gear.json の各アイテムから外部リンクを抽出する(url は https:// 固定 = parseGearData で検証済み) */
export function extractGearLinks(gear: GearData): { url: string; source: string }[] {
  return gear.items.map((item) => ({ url: item.url, source: `${item.brand} ${item.name}` }));
}

/**
 * faq.json の各項目から外部リンクを抽出する。
 * サイト内パス("/" 始まり。isInternalPath で判定)は監視対象外(死活監視の対象は外部サイトのみ)。
 */
export function extractFaqLinks(faq: FaqData): { url: string; source: string }[] {
  const links: { url: string; source: string }[] = [];
  for (const category of faq.categories) {
    for (const item of category.items) {
      if (item.link && !isInternalPath(item.link.url)) {
        links.push({ url: item.link.url, source: item.question });
      }
    }
  }
  return links;
}

/**
 * gear.json / faq.json から監視対象の外部リンクを集約する。
 * 同一 URL が複数箇所(例: 同じ商品が複数の Q&A から参照される等)から参照される場合は
 * 1 件にまとめ、参照元をすべて sources に保持する(重複チェック・重複報告を避けるため)。
 */
export function collectLinkTargets(gear: GearData, faq: FaqData): LinkTarget[] {
  const byUrl = new Map<string, string[]>();
  for (const { url, source } of [...extractGearLinks(gear), ...extractFaqLinks(faq)]) {
    const sources = byUrl.get(url);
    if (sources) {
      if (!sources.includes(source)) sources.push(source);
    } else {
      byUrl.set(url, [source]);
    }
  }
  return [...byUrl.entries()].map(([url, sources]) => ({ url, sources }));
}

export interface LinkProbeResult {
  ok: boolean;
  /** HTTP ステータスコード。ネットワークエラー・タイムアウト等で取得できなかった場合は null */
  status: number | null;
  /** ネットワークエラー・タイムアウト等のメッセージ。HTTP レスポンスを受け取れた場合は null */
  error: string | null;
}

/**
 * 1 件のリンクの生存確認を行う。
 * `probeIsShort` / `probeHqThumbnail`(src/lib/youtube.ts)と同じ方針で、
 * HEAD が 405(Method Not Allowed)/ 501(Not Implemented)を返した場合のみ GET にフォールバックする。
 * それ以外の非 2xx はリンク切れの判定として扱う(フォールバックしない)。
 */
export async function probeLink(url: string, fetchFn: FetchLike = fetch): Promise<LinkProbeResult> {
  let lastStatus: number | null = null;
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetchFn(url, { method, redirect: "follow" });
      lastStatus = res.status;
      if (res.ok) return { ok: true, status: res.status, error: null };
      if (method === "HEAD" && (res.status === 405 || res.status === 501)) continue;
      return { ok: false, status: res.status, error: null };
    } catch (error) {
      return {
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { ok: false, status: lastStatus, error: null };
}

export interface BrokenLink {
  url: string;
  sources: string[];
  status: number | null;
  error: string | null;
}

export interface LinkCheckReport {
  totalCount: number;
  brokenCount: number;
  broken: BrokenLink[];
  /** GitHub Issue 本文にそのまま使える Markdown 形式のサマリ */
  summary: string;
}

/** リンクごとのチェック結果から、Issue 通知に使うレポートを組み立てる(純粋関数・ネットワーク非依存) */
export function buildReport(
  targets: readonly LinkTarget[],
  results: readonly LinkProbeResult[],
): LinkCheckReport {
  if (targets.length !== results.length) {
    throw new Error(
      `targets(${targets.length} 件)と results(${results.length} 件)の件数が一致しません`,
    );
  }
  const broken: BrokenLink[] = [];
  targets.forEach((target, i) => {
    const result = results[i];
    if (!result.ok) {
      broken.push({
        url: target.url,
        sources: target.sources,
        status: result.status,
        error: result.error,
      });
    }
  });

  const summary =
    broken.length === 0
      ? `全 ${targets.length} 件の外部リンクは正常でした。`
      : [
          `${targets.length} 件中 ${broken.length} 件の外部リンクで異常を検知しました。`,
          "",
          ...broken.map((b) => {
            const status = b.status !== null ? `HTTP ${b.status}` : "取得失敗";
            const detail = b.error ? `(${b.error})` : "";
            return `- [${status}${detail}] ${b.url} — 参照元: ${b.sources.join(" / ")}`;
          }),
        ].join("\n");

  return { totalCount: targets.length, brokenCount: broken.length, broken, summary };
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function writeGitHubOutput(report: LinkCheckReport): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log("[check-links] GITHUB_OUTPUT 未設定のため標準出力のみに結果を表示します");
    return;
  }
  const lines = [
    `has_broken=${report.brokenCount > 0}`,
    `broken_count=${report.brokenCount}`,
    `total_count=${report.totalCount}`,
    // summary は改行を含むため GitHub Actions のマルチライン出力構文(delimiter)を使う
    // (check-fetch-freshness.ts と同じパターン)
    "summary<<CHECK_LINKS_SUMMARY_EOF",
    report.summary,
    "CHECK_LINKS_SUMMARY_EOF",
    "",
  ].join("\n");
  await appendFile(outputPath, lines);
}

async function main(fetchFn: FetchLike = fetchWithTimeout): Promise<void> {
  const gear = parseGearData(await Bun.file(GEAR_JSON_PATH).json());
  const faq = parseFaqData(await Bun.file(FAQ_JSON_PATH).json());
  const targets = collectLinkTargets(gear, faq);
  console.log(`[check-links] ${targets.length} 件の外部リンクを確認します`);

  const results = await mapWithConcurrency(targets, CHECK_CONCURRENCY, async (target) => {
    let result = await probeLink(target.url, fetchFn);
    // レスポンス自体は受け取れたが非 2xx(=明確なリンク切れ)の場合はリトライしない。
    // ネットワークエラー・タイムアウト(error !== null)のみ一時的な問題の可能性があるため
    // 300ms 後に 1 回だけリトライする(fetch-videos.ts の probeShorts 等と同じパターン)。
    if (!result.ok && result.error !== null) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      result = await probeLink(target.url, fetchFn);
    }
    return result;
  });

  const report = buildReport(targets, results);
  console.log(`[check-links] ${report.summary}`);
  await writeGitHubOutput(report);
}

// import.meta.main は直接実行時のみ true(テストからの import 時は false。fetch-videos.ts と同様)
if (import.meta.main) {
  await main();
}

export { main };
