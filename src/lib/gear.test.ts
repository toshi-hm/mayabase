import { describe, expect, test } from "bun:test";
import gearJson from "../data/gear.json";
import {
  GEAR_CATEGORY_LABELS,
  GEAR_CATEGORY_ORDER,
  groupGearByCategory,
  parseGearData,
} from "./gear";

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
