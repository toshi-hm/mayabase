import { describe, expect, test } from "bun:test";
import gearJson from "../data/gear.json";
import videosJson from "../data/videos.json";
import {
  buildVideoGearMap,
  GEAR_CATEGORY_LABELS,
  GEAR_CATEGORY_ORDER,
  gearDisplayName,
  gearTextMatches,
  groupGearByCategory,
  isAffiliateUrl,
  parseGearData,
  resolveGearVideos,
} from "./gear";
import { parseVideosData, type Video } from "./youtube";

const validItem = {
  name: "HHKB Professional HYBRID Type-S",
  brand: "PFU",
  category: "desk",
  url: "https://example.com/hhkb",
  image: "https://example.com/hhkb.jpg",
  note: "メインキーボード",
};

describe("parseGearData", () => {
  test("正常なデータをパースできる", () => {
    const { items } = parseGearData({ items: [validItem] });
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe(validItem.name);
    expect(items[0]?.image).toBe(validItem.image);
    expect(items[0]?.note).toBe(validItem.note);
  });

  test("note は省略できる", () => {
    const { note, ...withoutNote } = validItem;
    const { items } = parseGearData({ items: [withoutNote] });
    expect(items[0]?.note).toBeUndefined();
  });

  test("videoIds は省略できる", () => {
    const { items } = parseGearData({ items: [validItem] });
    expect(items[0]?.videoIds).toBeUndefined();
  });

  test("videoIds を指定するとパースできる(#70)", () => {
    const { items } = parseGearData({
      items: [{ ...validItem, videoIds: ["abc123", "def456"] }],
    });
    expect(items[0]?.videoIds).toEqual(["abc123", "def456"]);
  });

  test("videoIds が配列でない・空文字を含む場合は throw する(#70)", () => {
    expect(() => parseGearData({ items: [{ ...validItem, videoIds: "abc123" }] })).toThrow(
      "videoIds",
    );
    expect(() => parseGearData({ items: [{ ...validItem, videoIds: [""] }] })).toThrow("videoIds");
    expect(() => parseGearData({ items: [{ ...validItem, videoIds: [1] }] })).toThrow("videoIds");
  });

  test("オブジェクトでなければ throw する", () => {
    expect(() => parseGearData(null)).toThrow("オブジェクトではありません");
    expect(() => parseGearData([])).toThrow("items は配列");
  });

  test("必須フィールドの欠損・型不正は throw する", () => {
    expect(() => parseGearData({ items: [{ ...validItem, name: "" }] })).toThrow("name");
    expect(() => parseGearData({ items: [{ ...validItem, brand: 1 }] })).toThrow("brand");
    expect(() => parseGearData({ items: [{ ...validItem, category: "kitchen" }] })).toThrow(
      "category",
    );
    expect(() => parseGearData({ items: [{ ...validItem, note: 1 }] })).toThrow("note");
    expect(() => parseGearData({ items: [{ ...validItem, image: 1 }] })).toThrow("image");
  });

  test("商品画像も https 以外の URL を拒否する", () => {
    expect(() =>
      parseGearData({ items: [{ ...validItem, image: "http://example.com/hhkb.jpg" }] }),
    ).toThrow("image");
  });

  test("https 以外の URL は拒否する(スキーム混入防止)", () => {
    expect(() => parseGearData({ items: [{ ...validItem, url: "http://example.com" }] })).toThrow(
      "https://",
    );
    expect(() => parseGearData({ items: [{ ...validItem, url: "javascript:alert(1)" }] })).toThrow(
      "https://",
    );
  });

  test("実データ(gear.json)がスキーマを満たす(回帰テスト)", () => {
    const { items } = parseGearData(gearJson);
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("gearDisplayName", () => {
  test("ブランド名と製品名を半角スペース区切りで結合する(#134)", () => {
    expect(gearDisplayName({ brand: "PFU", name: "HHKB Professional HYBRID Type-S" })).toBe(
      "PFU HHKB Professional HYBRID Type-S",
    );
  });

  test("gear.json の全アイテムで組み立てられる(回帰テスト・#134)", () => {
    const { items } = parseGearData(gearJson);
    for (const item of items) {
      expect(gearDisplayName(item)).toBe(`${item.brand} ${item.name}`);
    }
  });
});

describe("gearTextMatches", () => {
  test("空クエリは常に一致する", () => {
    expect(gearTextMatches("hhkb", "pfu", "メインキーボード", "")).toBe(true);
  });

  test("製品名に含まれれば一致する", () => {
    expect(gearTextMatches("hhkb professional hybrid type-s", "pfu", "", "hhkb")).toBe(true);
  });

  test("ブランド名に含まれれば一致する", () => {
    expect(gearTextMatches("mx keys", "logicool", "", "logicool")).toBe(true);
  });

  test("コメントに含まれれば一致する", () => {
    expect(gearTextMatches("mx keys", "logicool", "メインキーボード", "キーボード")).toBe(true);
  });

  test("いずれにも含まれなければ不一致", () => {
    expect(gearTextMatches("mx keys", "logicool", "メインキーボード", "マイク")).toBe(false);
  });

  test("note が空文字でも例外にならない", () => {
    expect(gearTextMatches("mx keys", "logicool", "", "マイク")).toBe(false);
  });

  test("gear.json の全アイテムで例外なく判定できる(回帰テスト・#215)", () => {
    const { items } = parseGearData(gearJson);
    for (const item of items) {
      expect(
        gearTextMatches(
          item.name.toLowerCase(),
          item.brand.toLowerCase(),
          (item.note ?? "").toLowerCase(),
          item.brand.toLowerCase(),
        ),
      ).toBe(true);
    }
  });
});

describe("groupGearByCategory", () => {
  test("カテゴリ定義順にグループ化し、記載順を維持する", () => {
    const { items } = parseGearData(gearJson);
    const groups = groupGearByCategory(items);
    expect(groups.map(([category]) => category)).toEqual([...GEAR_CATEGORY_ORDER]);
    const total = groups.reduce((sum, [, groupItems]) => sum + groupItems.length, 0);
    expect(total).toBe(items.length);
  });
});

describe("カテゴリ定義", () => {
  test("すべてのカテゴリにラベルがある", () => {
    for (const category of GEAR_CATEGORY_ORDER) {
      expect(GEAR_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });
});

describe("isAffiliateUrl", () => {
  test("amzn.to / amzn.asia はアフィリエイトリンクと判定する", () => {
    expect(isAffiliateUrl("https://amzn.to/40bgFWc")).toBe(true);
    expect(isAffiliateUrl("https://amzn.asia/d/8aTE2PF")).toBe(true);
  });

  test("メーカー公式サイト等はアフィリエイトリンクと判定しない", () => {
    expect(isAffiliateUrl("https://www.flexispot.jp/e7-l.html")).toBe(false);
    expect(isAffiliateUrl("https://www.marshall.com/jp/ja/product/willen")).toBe(false);
  });

  test("不正なURLはアフィリエイトリンクと判定しない", () => {
    expect(isAffiliateUrl("not a url")).toBe(false);
  });

  test("gear.json の全リンクが期待どおり判定される(回帰テスト)", () => {
    const { items } = parseGearData(gearJson);
    for (const item of items) {
      const isAmazon = /^amzn\.(to|asia)$/.test(new URL(item.url).hostname);
      expect(isAffiliateUrl(item.url)).toBe(isAmazon);
    }
  });
});

const video1: Video = {
  id: "video1",
  title: "動画1",
  description: "",
  publishedAt: "2024-01-01T00:00:00Z",
  isShort: false,
  viewCount: null,
};
const video2: Video = {
  id: "video2",
  title: "動画2",
  description: "",
  publishedAt: "2024-01-02T00:00:00Z",
  isShort: true,
  viewCount: null,
};

describe("resolveGearVideos", () => {
  test("videoIds に対応する動画を記載順で返す(#70)", () => {
    const item = { videoIds: ["video2", "video1"] };
    expect(resolveGearVideos(item, [video1, video2])).toEqual([video2, video1]);
  });

  test("videos.json に存在しない ID は無視する(#70)", () => {
    const item = { videoIds: ["video1", "missing"] };
    expect(resolveGearVideos(item, [video1, video2])).toEqual([video1]);
  });

  test("videoIds が未指定・空配列なら空配列を返す(#70)", () => {
    expect(resolveGearVideos({ videoIds: undefined }, [video1])).toEqual([]);
    expect(resolveGearVideos({ videoIds: [] }, [video1])).toEqual([]);
  });

  test("gear.json の videoIds はすべて videos.json 内の実在 ID を指す(回帰テスト・#70)", () => {
    const { items: gearItems } = parseGearData(gearJson);
    const { videos } = parseVideosData(videosJson);
    for (const item of gearItems) {
      if (!item.videoIds) continue;
      expect(resolveGearVideos(item, videos)).toHaveLength(item.videoIds.length);
    }
  });
});

describe("buildVideoGearMap", () => {
  test("動画 ID → 紹介ガジェット一覧の逆引きマップを構築する(#70)", () => {
    const itemA = { ...validItem, name: "A", videoIds: ["video1"] };
    const itemB = { ...validItem, name: "B", videoIds: ["video1", "video2"] };
    const itemC = { ...validItem, name: "C" };
    const { items } = parseGearData({ items: [itemA, itemB, itemC] });

    const map = buildVideoGearMap(items);
    expect(map.get("video1")?.map((item) => item.name)).toEqual(["A", "B"]);
    expect(map.get("video2")?.map((item) => item.name)).toEqual(["B"]);
    expect(map.has("video3")).toBe(false);
  });

  test("videoIds を持つガジェットが無ければ空のマップを返す(#70)", () => {
    const { items } = parseGearData(gearJson);
    const withoutVideoIds = items.filter((item) => !item.videoIds);
    expect(buildVideoGearMap(withoutVideoIds).size).toBe(0);
  });
});
