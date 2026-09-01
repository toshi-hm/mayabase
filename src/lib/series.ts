import { textMatchesKeyword } from "./format";
import type { Video } from "./youtube";

/**
 * シリーズ 1 件分のデータ。series.json で手動管理する(#250)。
 * カテゴリ(ai/gadget/vlog/career)を横断して付与されるタイトルタグ的な企画を想定しており、
 * `categorizeVideo`(カテゴリ判定)とは独立に判定する。
 */
export interface SeriesItem {
  /** URL スラッグ(半角英小文字・数字・ハイフンのみ。/videos/series/{slug}/ になる) */
  slug: string;
  /** 表示用タイトル */
  title: string;
  /** このシリーズに属する動画をタイトルから判定するキーワード */
  keyword: string;
  /** アーカイブページの紹介文 */
  description: string;
}

/** series.json 全体の構造 */
export interface SeriesData {
  series: SeriesItem[];
}

/** URL スラッグとして安全な形式(半角英小文字・数字・ハイフンのみ、先頭末尾はハイフン不可) */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * series.json の内容を検証しつつパースする(gear.ts / faq.ts と同じ方針・#250)。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseSeriesData(data: unknown): SeriesData {
  if (typeof data !== "object" || data === null) {
    throw new Error("series.json: オブジェクトではありません");
  }
  const { series } = data as { series?: unknown };
  if (!Array.isArray(series)) {
    throw new Error("series.json: series は配列である必要があります");
  }
  const seenSlugs = new Set<string>();
  const parsed: SeriesItem[] = series.map((raw, i) => {
    const item = raw as Partial<Record<keyof SeriesItem, unknown>>;
    if (typeof item.slug !== "string" || !SLUG_PATTERN.test(item.slug)) {
      throw new Error(
        `series.json: series[${i}].slug は半角英小文字・数字・ハイフンのみで構成される必要があります`,
      );
    }
    if (seenSlugs.has(item.slug)) {
      throw new Error(`series.json: series[${i}].slug "${item.slug}" が重複しています`);
    }
    seenSlugs.add(item.slug);
    if (typeof item.title !== "string" || item.title.length === 0) {
      throw new Error(`series.json: series[${i}].title が不正です`);
    }
    if (typeof item.keyword !== "string" || item.keyword.length === 0) {
      throw new Error(`series.json: series[${i}].keyword が不正です`);
    }
    if (typeof item.description !== "string" || item.description.length === 0) {
      throw new Error(`series.json: series[${i}].description が不正です`);
    }
    return {
      slug: item.slug,
      title: item.title,
      keyword: item.keyword,
      description: item.description,
    };
  });
  return { series: parsed };
}

/**
 * 動画のタイトルがシリーズのキーワードに該当するかを判定する。
 * `textMatchesKeyword`(format.ts、動画ライブラリ・FAQ・愛用ガジェットの検索と共通)を再利用する。
 * `isFutatsuNoWarajiSeries`(#174)を任意のシリーズに汎用化したもの(#250)。
 */
export function isInSeries(video: Pick<Video, "title">, keyword: string): boolean {
  return textMatchesKeyword(video.title, keyword);
}

/** シリーズアーカイブページの URL(#174 を汎用化・#250) */
export function seriesUrl(slug: string): string {
  return `/videos/series/${slug}/`;
}

/** シリーズと、そのシリーズに該当する動画の組(#305) */
export interface SeriesWithVideos {
  series: SeriesItem;
  videos: Video[];
}

/**
 * 各シリーズに該当動画を紐付ける。該当動画が 1 件もないシリーズは除外する
 * (空のアーカイブページ・一覧カードが index ページに表示される事故を防ぐ。
 * videos/series/[slug].astro の getStaticPaths と /videos/series/ 一覧ページで共通利用する・#305)。
 */
export function getSeriesWithVideos(series: SeriesItem[], videos: Video[]): SeriesWithVideos[] {
  return series
    .map((item) => ({
      series: item,
      videos: videos.filter((video) => isInSeries(video, item.keyword)),
    }))
    .filter((entry) => entry.videos.length > 0);
}
