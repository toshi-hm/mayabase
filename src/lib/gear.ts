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
}

/** gear.json 全体の構造 */
export interface GearData {
  items: GearItem[];
}

function isGearCategory(value: unknown): value is GearCategory {
  return typeof value === "string" && (GEAR_CATEGORY_ORDER as readonly string[]).includes(value);
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
    return {
      name: item.name,
      brand: item.brand,
      category: item.category,
      url: item.url,
      ...(item.image !== undefined ? { image: item.image } : {}),
      ...(item.note !== undefined ? { note: item.note } : {}),
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
