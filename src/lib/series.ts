import { textMatchesKeyword } from "./format";
import type { Video } from "./youtube";

/** YouTube 再生リストIDとして妥当な形式(英数字・アンダースコア・ハイフン、#408) */
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

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
  /**
   * このシリーズに属する動画をタイトルから判定するキーワード。
   * youtubePlaylistId のみで判定する場合は省略できるが、その場合は youtubePlaylistId が必須(#408)。
   */
  keyword?: string;
  /**
   * このシリーズに対応する YouTube 再生リストID(#408)。設定すると、
   * `scripts/fetch-videos.ts` が取得する再生リストの所属動画も判定に加える
   * (キーワード判定とは OR 条件。YouTube Studio 側の再生リスト整理がそのままサイトに反映される)。
   * 既存のキーワード方式はこのフィールドが無くても引き続き動作する(併存)。
   */
  youtubePlaylistId?: string;
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
    if (
      item.keyword !== undefined &&
      (typeof item.keyword !== "string" || item.keyword.length === 0)
    ) {
      throw new Error(`series.json: series[${i}].keyword が不正です`);
    }
    if (
      item.youtubePlaylistId !== undefined &&
      (typeof item.youtubePlaylistId !== "string" ||
        !PLAYLIST_ID_PATTERN.test(item.youtubePlaylistId))
    ) {
      throw new Error(`series.json: series[${i}].youtubePlaylistId が不正です`);
    }
    if (!item.keyword && !item.youtubePlaylistId) {
      throw new Error(
        `series.json: series[${i}] には keyword または youtubePlaylistId のいずれかが必要です`,
      );
    }
    if (typeof item.description !== "string" || item.description.length === 0) {
      throw new Error(`series.json: series[${i}].description が不正です`);
    }
    return {
      slug: item.slug,
      title: item.title,
      ...(item.keyword !== undefined && { keyword: item.keyword }),
      ...(item.youtubePlaylistId !== undefined && { youtubePlaylistId: item.youtubePlaylistId }),
      description: item.description,
    };
  });
  return { series: parsed };
}

/**
 * 動画のタイトルがシリーズのキーワードに該当するかを判定する。
 * `textMatchesKeyword`(format.ts、動画ライブラリ・FAQ・愛用ガジェットの検索と共通)を再利用する。
 * `isFutatsuNoWarajiSeries`(#174)を任意のシリーズに汎用化したもの(#250)。
 * `keyword` は textMatchesKeyword("", "") が true を返すため、空文字列を渡してはいけない
 * (呼び出し元は isVideoInSeries を使うことを推奨)。
 */
export function isInSeries(video: Pick<Video, "title">, keyword: string): boolean {
  return textMatchesKeyword(video.title, keyword);
}

/**
 * 動画がシリーズに該当するかを判定する。キーワード一致(任意)と再生リスト所属(任意)の
 * OR 条件で判定する(#408)。playlistVideoIds は series.json の youtubePlaylistId に対応する
 * 再生リストの所属動画IDの集合(呼び出し側が playlists.json から用意する)。
 */
export function isVideoInSeries(
  video: Pick<Video, "id" | "title">,
  item: Pick<SeriesItem, "keyword" | "youtubePlaylistId">,
  playlistVideoIds?: ReadonlySet<string>,
): boolean {
  if (item.keyword && isInSeries(video, item.keyword)) return true;
  return item.youtubePlaylistId ? (playlistVideoIds?.has(video.id) ?? false) : false;
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
 * playlistIndex は youtubePlaylistId → 所属動画IDの集合(playlists.ts の buildPlaylistVideoIdIndex
 * が生成する)。省略時はキーワード判定のみになる(#408)。
 */
export function getSeriesWithVideos(
  series: SeriesItem[],
  videos: Video[],
  playlistIndex: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): SeriesWithVideos[] {
  return series
    .map((item) => ({
      series: item,
      videos: videos.filter((video) =>
        isVideoInSeries(
          video,
          item,
          item.youtubePlaylistId ? playlistIndex.get(item.youtubePlaylistId) : undefined,
        ),
      ),
    }))
    .filter((entry) => entry.videos.length > 0);
}
