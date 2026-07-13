import { describe, expect, test } from "bun:test";
import faqJson from "../data/faq.json";
import { parseFaqData } from "./faq";

const validItem = {
  question: "どんなチャンネルですか?",
  answer: "AI・ガジェット・Vlog を発信しています。",
  link: { label: "YouTube へ", url: "https://youtube.com/@maya_base" },
};

const validData = { categories: [{ title: "チャンネルについて", items: [validItem] }] };

describe("parseFaqData", () => {
  test("正常なデータをパースできる", () => {
    const { categories } = parseFaqData(validData);
    expect(categories).toHaveLength(1);
    expect(categories[0]?.items[0]?.question).toBe(validItem.question);
    expect(categories[0]?.items[0]?.link?.url).toBe(validItem.link.url);
  });

  test("link は省略できる", () => {
    const { link, ...withoutLink } = validItem;
    const { categories } = parseFaqData({
      categories: [{ title: "t", items: [withoutLink] }],
    });
    expect(categories[0]?.items[0]?.link).toBeUndefined();
  });

  test("オブジェクトでなければ throw する", () => {
    expect(() => parseFaqData(null)).toThrow("オブジェクトではありません");
    expect(() => parseFaqData({})).toThrow("categories は配列");
  });

  test("カテゴリ・Q&A の欠損や型不正は throw する", () => {
    expect(() => parseFaqData({ categories: [{ title: "", items: [validItem] }] })).toThrow(
      "title",
    );
    expect(() => parseFaqData({ categories: [{ title: "t", items: [] }] })).toThrow("1 件以上");
    expect(() =>
      parseFaqData({ categories: [{ title: "t", items: [{ ...validItem, question: "" }] }] }),
    ).toThrow("question");
    expect(() =>
      parseFaqData({ categories: [{ title: "t", items: [{ ...validItem, answer: 1 }] }] }),
    ).toThrow("answer");
  });

  test("link の URL はサイト内パスか https のみ許可する", () => {
    const withUrl = (url: string) => ({
      categories: [{ title: "t", items: [{ ...validItem, link: { label: "l", url } }] }],
    });
    expect(parseFaqData(withUrl("/videos/")).categories[0]?.items[0]?.link?.url).toBe("/videos/");
    expect(() => parseFaqData(withUrl("http://example.com"))).toThrow("https://");
    expect(() => parseFaqData(withUrl("javascript:alert(1)"))).toThrow("https://");
  });

  test("実データ(faq.json)がスキーマを満たす(回帰テスト)", () => {
    const { categories } = parseFaqData(faqJson);
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.items.length).toBeGreaterThan(0);
    }
  });
});
