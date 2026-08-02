import type { Video } from "./youtube";

/** 愛用ガジェットのカテゴリ(表示順) */
export const GEAR_CATEGORY_ORDER = ["desk", "studio", "audio-smart"] as const;

export type GearCategory = (typeof GEAR_CATEGORY_ORDER)[number];

/** カテゴリの表示ラベル */
export const GEAR_CATEGORY_LABELS: Record<GearCategory, string> = {
  desk: "デスク環境",
  studio: "撮影・配信機材",
  "audio-smart": "オーディオ・スマート家電",
};

/** ガジェット 1 件分のデータ。gear.json で手動管理する */
export interface GearItem {
  /** 製品名 */
  name: string;
  /** ブランド名 */
  brand: string;
  category: GearCategory;
  /** 外部リンク(https のみ。Amazon リンクはアフィリエイト) */
  url: string;
  /** 商品画像 URL(任意。Amazon またはメーカー公式の商品ページ由来) */
  image?: string;
  /** ひとことコメント(任意) */
  note?: string;
  /**
   * このガジェットを紹介した動画の YouTube video ID(任意・手動管理)。
   * 「愛用ガジェット」⇄「動画ライブラリ」の相互リンク用(#70)。存在しない ID は表示側で無視する。
   */
  videoIds?: string[];
}

/** gear.json 全体の構造 */
export interface GearData {
  items: GearItem[];
}

function isGearCategory(value: unknown): value is GearCategory {
  return typeof value === "string" && (GEAR_CATEGORY_ORDER as readonly string[]).includes(value);
}

/** Amazon アソシエイトの短縮リンクとして使われるホスト名(gear.json 運用上、アフィリエイトリンクはこれらのみ) */
const AFFILIATE_HOSTNAMES = new Set(["amzn.to", "amzn.asia"]);

/**
 * URL が Amazon アフィリエイトリンクかどうかを判定する。
 * `rel="sponsored"` は対価を伴うリンクにのみ付与すべきという Google のガイドラインに沿うため、
 * gear.json 内の非 Amazon(メーカー公式サイト等)リンクと区別するのに使う。
 */
export function isAffiliateUrl(url: string): boolean {
  try {
    return AFFILIATE_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * gear.json の内容を検証しつつパースする。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseGearData(data: unknown): GearData {
  if (typeof data !== "object" || data === null) {
    throw new Error("gear.json: オブジェクトではありません");
  }
  const { items } = data as { items?: unknown };
  if (!Array.isArray(items)) {
    throw new Error("gear.json: items は配列である必要があります");
  }
  const parsed: GearItem[] = items.map((raw, i) => {
    const item = raw as Partial<Record<keyof GearItem, unknown>>;
    if (typeof item.name !== "string" || item.name.length === 0) {
      throw new Error(`gear.json: items[${i}].name が不正です`);
    }
    if (typeof item.brand !== "string" || item.brand.length === 0) {
      throw new Error(`gear.json: items[${i}].brand が不正です`);
    }
    if (!isGearCategory(item.category)) {
      throw new Error(
        `gear.json: items[${i}].category は ${GEAR_CATEGORY_ORDER.join(" / ")} のいずれかである必要があります`,
      );
    }
    // https 限定(誤記や javascript: 等のスキーム混入を防ぐ)
    if (typeof item.url !== "string" || !item.url.startsWith("https://")) {
      throw new Error(`gear.json: items[${i}].url は https:// で始まる必要があります`);
    }
    if (
      item.image !== undefined &&
      (typeof item.image !== "string" || !item.image.startsWith("https://"))
    ) {
      throw new Error(`gear.json: items[${i}].image は https:// で始まる必要があります`);
    }
    if (item.note !== undefined && typeof item.note !== "string") {
      throw new Error(`gear.json: items[${i}].note は文字列である必要があります`);
    }
    if (
      item.videoIds !== undefined &&
      (!Array.isArray(item.videoIds) ||
        item.videoIds.some((id) => typeof id !== "string" || id.length === 0))
    ) {
      throw new Error(`gear.json: items[${i}].videoIds は文字列の配列である必要があります`);
    }
    return {
      name: item.name,
      brand: item.brand,
      category: item.category,
      url: item.url,
      ...(item.image !== undefined ? { image: item.image } : {}),
      ...(item.note !== undefined ? { note: item.note } : {}),
      ...(item.videoIds !== undefined ? { videoIds: item.videoIds as string[] } : {}),
    };
  });
  return { items: parsed };
}

/** カテゴリごとにグループ化する(GEAR_CATEGORY_ORDER 順。JSON 内の記載順は維持) */
export function groupGearByCategory(items: readonly GearItem[]): [GearCategory, GearItem[]][] {
  return GEAR_CATEGORY_ORDER.map((category) => [
    category,
    items.filter((item) => item.category === category),
  ]);
}

/**
 * ガジェット 1 件が紹介されている動画を videoIds から解決する(#70)。
 * videos.json 側に存在しない ID(削除・typo 等)は無視し、throw しない(手動管理データのため)。
 */
export function resolveGearVideos(
  item: Pick<GearItem, "videoIds">,
  videos: readonly Video[],
): Video[] {
  if (!item.videoIds || item.videoIds.length === 0) return [];
  const videoById = new Map(videos.map((video) => [video.id, video]));
  return item.videoIds
    .map((id) => videoById.get(id))
    .filter((video): video is Video => video !== undefined);
}

/**
 * 動画 ID → その動画で紹介されているガジェット一覧、の逆引きマップを構築する(#70)。
 * gear.json の記載順を維持する。
 */
export function buildVideoGearMap(items: readonly GearItem[]): Map<string, GearItem[]> {
  const map = new Map<string, GearItem[]>();
  for (const item of items) {
    for (const videoId of item.videoIds ?? []) {
      const existing = map.get(videoId);
      if (existing) {
        existing.push(item);
      } else {
        map.set(videoId, [item]);
      }
    }
  }
  return map;
}
