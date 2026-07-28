import { describe, expect, test } from "bun:test";
import faqJson from "../data/faq.json";
import { deobfuscateEmail, faqTextMatches, parseFaqData } from "./faq";

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
    // プロトコル相対 URL は外部オリジンに解決されるため「サイト内パス」として通さない
    expect(() => parseFaqData(withUrl("//evil.example.com"))).toThrow("https://");
  });

  test("実データ(faq.json)がスキーマを満たす(回帰テスト)", () => {
    const { categories } = parseFaqData(faqJson);
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.items.length).toBeGreaterThan(0);
    }
  });

  test("email は「☆」でマスクされていれば許可する", () => {
    const { categories } = parseFaqData({
      categories: [{ title: "t", items: [{ ...validItem, email: "contact☆example.com" }] }],
    });
    expect(categories[0]?.items[0]?.email).toBe("contact☆example.com");
  });

  test("email は省略できる", () => {
    const { categories } = parseFaqData(validData);
    expect(categories[0]?.items[0]?.email).toBeUndefined();
  });

  test("email に「☆」が無い、または生の「@」を含む場合は throw する", () => {
    const withEmail = (email: string) => ({
      categories: [{ title: "t", items: [{ ...validItem, email }] }],
    });
    expect(() => parseFaqData(withEmail("contact@example.com"))).toThrow("☆");
    expect(() => parseFaqData(withEmail("no-at-sign"))).toThrow("☆");
  });
});

describe("deobfuscateEmail", () => {
  test("「☆」を「@」に戻す", () => {
    expect(deobfuscateEmail("mayabaseofficial☆gmail.com")).toBe("mayabaseofficial@gmail.com");
  });
});

describe("faqTextMatches", () => {
  test("空クエリは常に一致する", () => {
    expect(faqTextMatches("質問", "回答", "")).toBe(true);
  });

  test("質問文に含まれれば一致する", () => {
    expect(faqTextMatches("使用機材について", "キーボードです", "機材")).toBe(true);
  });

  test("回答文に含まれれば一致する", () => {
    expect(faqTextMatches("よくある質問", "キーボードを使っています", "キーボード")).toBe(true);
  });

  test("どちらにも含まれなければ不一致", () => {
    expect(faqTextMatches("よくある質問", "AIについて", "旅行")).toBe(false);
  });
});
