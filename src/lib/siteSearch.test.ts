import { describe, expect, test } from "bun:test";
import faqJson from "../data/faq.json";
import gearJson from "../data/gear.json";
import glossaryJson from "../data/glossary.json";
import videosJson from "../data/videos.json";
import { parseFaqData } from "./faq";
import { parseGearData } from "./gear";
import { parseGlossaryData } from "./glossary";
import {
  buildSiteSearchIndex,
  searchSiteIndex,
  siteSearchResultUrl,
  siteSearchTypeLabel,
} from "./siteSearch";
import { parseVideosData } from "./youtube";

const videos = [
  {
    id: "abc12345678",
    title: "HHKBキーボードのレビュー",
    description: "冒頭のダミー説明文です。",
    publishedAt: "2026-01-01T00:00:00Z",
    isShort: false,
    viewCount: 100,
    duration: null,
  },
  {
    id: "def12345678",
    title: "AIツールまとめ",
    description: "別の説明文です。",
    publishedAt: "2026-01-02T00:00:00Z",
    isShort: false,
    viewCount: 200,
    duration: null,
  },
];

const faqCategories = [
  {
    title: "機材について",
    items: [
      {
        question: "使っているキーボードは?",
        answer: "HHKB Professional HYBRID Type-S を使っています。",
      },
      { question: "チャンネルの内容は?", answer: "AI やガジェットの紹介をしています。" },
    ],
  },
];

const gearItems = [
  {
    name: "HHKB Professional HYBRID Type-S",
    brand: "PFU",
    category: "desk" as const,
    url: "https://example.com/hhkb",
    note: "メインキーボードです。",
  },
  {
    name: "MX Master 3S",
    brand: "logicool",
    category: "desk" as const,
    url: "https://example.com/mouse",
  },
];

const glossaryItems = [
  { term: "RAG", definition: "検索拡張生成のこと。外部知識を検索して回答生成に使う手法です。" },
  { term: "LLM", definition: "大規模言語モデルのこと。" },
];

describe("buildSiteSearchIndex", () => {
  test("動画・FAQ・ガジェット・用語集をまとめて1つのインデックスにする", () => {
    const index = buildSiteSearchIndex(videos, faqCategories, gearItems, glossaryItems);
    expect(index).toHaveLength(videos.length + 2 + gearItems.length + glossaryItems.length);
    expect(index.filter((item) => item.type === "video")).toHaveLength(videos.length);
    expect(index.filter((item) => item.type === "faq")).toHaveLength(2);
    expect(index.filter((item) => item.type === "gear")).toHaveLength(gearItems.length);
    expect(index.filter((item) => item.type === "glossary")).toHaveLength(glossaryItems.length);
  });

  test("動画の候補は動画タイトルを query・遷移先を /videos/ にする", () => {
    const index = buildSiteSearchIndex(videos, [], [], []);
    expect(index[0]).toMatchObject({
      type: "video",
      title: "HHKBキーボードのレビュー",
      href: "/videos/",
      query: "HHKBキーボードのレビュー",
    });
    // 概要欄の全文は含めない(ヘッダーは全ページ表示のため軽量に保つ)
    expect(index[0]?.searchText).not.toContain("ダミー説明文");
  });

  test("FAQの候補は質問文を query・遷移先を /faq/ にし、質問+回答を検索対象にする", () => {
    const index = buildSiteSearchIndex([], faqCategories, [], []);
    expect(index[0]).toMatchObject({
      type: "faq",
      title: "使っているキーボードは?",
      subtitle: "機材について",
      href: "/faq/",
      query: "使っているキーボードは?",
    });
    expect(index[0]?.searchText).toContain("HHKB Professional HYBRID Type-S");
  });

  test("ガジェットの候補は商品名を query・遷移先を /gear/ にする", () => {
    const index = buildSiteSearchIndex([], [], gearItems, []);
    expect(index[0]).toMatchObject({
      type: "gear",
      title: "PFU HHKB Professional HYBRID Type-S",
      href: "/gear/",
      query: "HHKB Professional HYBRID Type-S",
    });
    expect(index[0]?.searchText).toContain("PFU");
    expect(index[0]?.searchText).toContain("メインキーボードです。");
  });

  test("用語集の候補は用語を query・遷移先を /glossary/ にし、用語+解説を検索対象にする", () => {
    const index = buildSiteSearchIndex([], [], [], glossaryItems);
    expect(index[0]).toMatchObject({
      type: "glossary",
      title: "RAG",
      subtitle: "用語集",
      href: "/glossary/",
      query: "RAG",
    });
    expect(index[0]?.searchText).toContain("検索拡張生成");
  });

  test("実データ(videos.json / faq.json / gear.json / glossary.json)からインデックスを構築できる(回帰テスト)", () => {
    const { videos: realVideos } = parseVideosData(videosJson);
    const { categories } = parseFaqData(faqJson);
    const { items } = parseGearData(gearJson);
    const { items: glossary } = parseGlossaryData(glossaryJson);
    const index = buildSiteSearchIndex(realVideos, categories, items, glossary);
    expect(index.length).toBe(
      realVideos.length +
        categories.reduce((sum, category) => sum + category.items.length, 0) +
        items.length +
        glossary.length,
    );
  });
});

describe("searchSiteIndex", () => {
  const index = buildSiteSearchIndex(videos, faqCategories, gearItems, glossaryItems);

  test("空クエリでは候補を返さない", () => {
    expect(searchSiteIndex(index, "", 5)).toEqual([]);
    expect(searchSiteIndex(index, "   ", 5)).toEqual([]);
  });

  test("動画タイトル・FAQ・ガジェット名・用語集を横断して照合する", () => {
    const results = searchSiteIndex(index, "RAG", 5);
    const types = results.map((item) => item.type);
    expect(types).toContain("glossary");
  });

  test("動画タイトル・FAQ・ガジェット名を横断して照合する", () => {
    const results = searchSiteIndex(index, "キーボード", 5);
    const types = results.map((item) => item.type);
    expect(types).toContain("video");
    expect(types).toContain("faq");
    expect(types).toContain("gear");
  });

  test("FAQ は回答文にのみ含まれるキーワードでも一致する", () => {
    const results = searchSiteIndex(index, "Type-S", 5);
    expect(
      results.some((item) => item.type === "faq" && item.title === "使っているキーボードは?"),
    ).toBe(true);
  });

  test("種別ごとに limitPerType 件で頭打ちになる", () => {
    const manyVideos = Array.from({ length: 10 }, (_, i) => ({
      id: `video-${i}`,
      title: `AI活用術 その${i}`,
      description: "",
      publishedAt: "2026-01-01T00:00:00Z",
      isShort: false,
      viewCount: null,
      duration: null,
    }));
    const bigIndex = buildSiteSearchIndex(manyVideos, [], [], []);
    const results = searchSiteIndex(bigIndex, "AI", 3);
    expect(results).toHaveLength(3);
  });

  test("該当がなければ空配列を返す", () => {
    expect(searchSiteIndex(index, "存在しないキーワードxyz", 5)).toEqual([]);
  });

  test("英数字キーワードは単語境界で照合する(既存の検索と同じルール)", () => {
    const results = searchSiteIndex(index, "AI", 5);
    expect(results.some((item) => item.title === "AIツールまとめ")).toBe(true);
  });
});

describe("siteSearchResultUrl", () => {
  test("href と query から遷移先 URL を組み立てる", () => {
    expect(siteSearchResultUrl({ href: "/videos/", query: "HHKB" })).toBe("/videos/?q=HHKB");
  });

  test("query は URL エンコードする", () => {
    expect(siteSearchResultUrl({ href: "/faq/", query: "使っているキーボードは?" })).toBe(
      `/faq/?q=${encodeURIComponent("使っているキーボードは?")}`,
    );
  });
});

describe("siteSearchTypeLabel", () => {
  test("種別ごとの表示ラベルを返す", () => {
    expect(siteSearchTypeLabel("video")).toBe("動画");
    expect(siteSearchTypeLabel("faq")).toBe("FAQ");
    expect(siteSearchTypeLabel("gear")).toBe("ガジェット");
    expect(siteSearchTypeLabel("glossary")).toBe("用語集");
  });
});
