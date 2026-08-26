import { describe, expect, test } from "bun:test";
import gearJson from "../data/gear.json";
import glossaryJson from "../data/glossary.json";
import videosJson from "../data/videos.json";
import { parseGearData } from "./gear";
import {
  buildDefinedTermSetJsonLd,
  glossaryTermAnchorId,
  glossaryTextMatches,
  parseGlossaryData,
  resolveGlossaryGear,
  resolveGlossaryVideos,
  sortGlossaryTerms,
} from "./glossary";
import { parseVideosData, type Video } from "./youtube";

const validItem = {
  term: "RAG",
  definition: "外部の文書を検索して回答に組み込む生成AIの手法。",
};

describe("parseGlossaryData", () => {
  test("正常なデータをパースできる", () => {
    const { items } = parseGlossaryData({ items: [validItem] });
    expect(items).toHaveLength(1);
    expect(items[0]?.term).toBe(validItem.term);
    expect(items[0]?.definition).toBe(validItem.definition);
  });

  test("relatedVideoIds / relatedGearNames は省略できる", () => {
    const { items } = parseGlossaryData({ items: [validItem] });
    expect(items[0]?.relatedVideoIds).toBeUndefined();
    expect(items[0]?.relatedGearNames).toBeUndefined();
  });

  test("relatedVideoIds / relatedGearNames を指定するとパースできる", () => {
    const { items } = parseGlossaryData({
      items: [{ ...validItem, relatedVideoIds: ["abc123"], relatedGearNames: ["HHKB"] }],
    });
    expect(items[0]?.relatedVideoIds).toEqual(["abc123"]);
    expect(items[0]?.relatedGearNames).toEqual(["HHKB"]);
  });

  test("relatedVideoIds が配列でない・空文字を含む場合は throw する", () => {
    expect(() =>
      parseGlossaryData({ items: [{ ...validItem, relatedVideoIds: "abc123" }] }),
    ).toThrow("relatedVideoIds");
    expect(() => parseGlossaryData({ items: [{ ...validItem, relatedVideoIds: [""] }] })).toThrow(
      "relatedVideoIds",
    );
  });

  test("relatedGearNames が配列でない・空文字を含む場合は throw する", () => {
    expect(() =>
      parseGlossaryData({ items: [{ ...validItem, relatedGearNames: "HHKB" }] }),
    ).toThrow("relatedGearNames");
    expect(() => parseGlossaryData({ items: [{ ...validItem, relatedGearNames: [""] }] })).toThrow(
      "relatedGearNames",
    );
  });

  test("オブジェクトでなければ throw する", () => {
    expect(() => parseGlossaryData(null)).toThrow("オブジェクトではありません");
    expect(() => parseGlossaryData({})).toThrow("items は配列");
  });

  test("必須フィールドの欠損・型不正は throw する", () => {
    expect(() => parseGlossaryData({ items: [{ ...validItem, term: "" }] })).toThrow("term");
    expect(() => parseGlossaryData({ items: [{ ...validItem, definition: "" }] })).toThrow(
      "definition",
    );
  });

  test("term が重複していれば throw する", () => {
    expect(() => parseGlossaryData({ items: [validItem, validItem] })).toThrow("重複");
  });

  test("実データ(glossary.json)がスキーマを満たす(回帰テスト)", () => {
    const { items } = parseGlossaryData(glossaryJson);
    expect(items.length).toBeGreaterThan(0);
  });

  test("glossary.json の relatedVideoIds はすべて videos.json 内の実在 ID を指す(回帰テスト)", () => {
    const { items } = parseGlossaryData(glossaryJson);
    const { videos } = parseVideosData(videosJson);
    for (const item of items) {
      if (!item.relatedVideoIds) continue;
      expect(resolveGlossaryVideos(item, videos)).toHaveLength(item.relatedVideoIds.length);
    }
  });

  test("glossary.json の relatedGearNames はすべて gear.json 内の実在名を指す(回帰テスト)", () => {
    const { items } = parseGlossaryData(glossaryJson);
    const { items: gearItems } = parseGearData(gearJson);
    for (const item of items) {
      if (!item.relatedGearNames) continue;
      expect(resolveGlossaryGear(item, gearItems)).toHaveLength(item.relatedGearNames.length);
    }
  });
});

describe("glossaryTextMatches", () => {
  test("空クエリは常に一致する", () => {
    expect(glossaryTextMatches("RAG", "外部文書を検索する手法", "")).toBe(true);
  });

  test("用語に含まれれば一致する", () => {
    expect(glossaryTextMatches("静電容量無接点方式", "打鍵感が独特", "静電容量")).toBe(true);
  });

  test("解説文に含まれれば一致する", () => {
    expect(glossaryTextMatches("RAG", "外部文書を検索する手法", "検索")).toBe(true);
  });

  test("いずれにも含まれなければ不一致", () => {
    expect(glossaryTextMatches("RAG", "外部文書を検索する手法", "ジンバル")).toBe(false);
  });

  test("英数字キーワードは単語境界で照合する", () => {
    expect(glossaryTextMatches("AG06MK2", "オーディオインターフェース", "ai")).toBe(false);
  });
});

describe("sortGlossaryTerms", () => {
  test("あいうえお順に並べ替える", () => {
    const items = [{ term: "わ" }, { term: "あ" }, { term: "か" }];
    expect(sortGlossaryTerms(items).map((item) => item.term)).toEqual(["あ", "か", "わ"]);
  });

  test("引数の配列を変更しない", () => {
    const items = [{ term: "b" }, { term: "a" }];
    const original = [...items];
    sortGlossaryTerms(items);
    expect(items).toEqual(original);
  });

  test("glossary.json の全件を例外なく並べ替えられる(回帰テスト)", () => {
    const { items } = parseGlossaryData(glossaryJson);
    expect(sortGlossaryTerms(items)).toHaveLength(items.length);
  });
});

const video1: Video = {
  id: "video1",
  title: "動画1",
  description: "",
  publishedAt: "2024-01-01T00:00:00Z",
  isShort: false,
  viewCount: null,
  duration: null,
};
const video2: Video = {
  id: "video2",
  title: "動画2",
  description: "",
  publishedAt: "2024-01-02T00:00:00Z",
  isShort: true,
  viewCount: null,
  duration: null,
};

describe("resolveGlossaryVideos", () => {
  test("relatedVideoIds に対応する動画を記載順で返す", () => {
    const item = { relatedVideoIds: ["video2", "video1"] };
    expect(resolveGlossaryVideos(item, [video1, video2])).toEqual([video2, video1]);
  });

  test("videos.json に存在しない ID は無視する", () => {
    const item = { relatedVideoIds: ["video1", "missing"] };
    expect(resolveGlossaryVideos(item, [video1, video2])).toEqual([video1]);
  });

  test("relatedVideoIds が未指定・空配列なら空配列を返す", () => {
    expect(resolveGlossaryVideos({ relatedVideoIds: undefined }, [video1])).toEqual([]);
    expect(resolveGlossaryVideos({ relatedVideoIds: [] }, [video1])).toEqual([]);
  });
});

describe("resolveGlossaryGear", () => {
  test("relatedGearNames に対応するガジェットを記載順で返す", () => {
    const { items: gearItems } = parseGearData({
      items: [
        { name: "A", brand: "b", category: "desk", url: "https://example.com/a" },
        { name: "B", brand: "b", category: "desk", url: "https://example.com/b" },
      ],
    });
    const item = { relatedGearNames: ["B", "A"] };
    expect(resolveGlossaryGear(item, gearItems).map((g) => g.name)).toEqual(["B", "A"]);
  });

  test("gear.json に存在しない名称は無視する", () => {
    const { items: gearItems } = parseGearData({
      items: [{ name: "A", brand: "b", category: "desk", url: "https://example.com/a" }],
    });
    const item = { relatedGearNames: ["A", "存在しない名前"] };
    expect(resolveGlossaryGear(item, gearItems).map((g) => g.name)).toEqual(["A"]);
  });

  test("relatedGearNames が未指定・空配列なら空配列を返す", () => {
    const { items: gearItems } = parseGearData({
      items: [{ name: "A", brand: "b", category: "desk", url: "https://example.com/a" }],
    });
    expect(resolveGlossaryGear({ relatedGearNames: undefined }, gearItems)).toEqual([]);
    expect(resolveGlossaryGear({ relatedGearNames: [] }, gearItems)).toEqual([]);
  });
});

describe("glossaryTermAnchorId", () => {
  test("インデックスから一意なアンカー ID を組み立てる", () => {
    expect(glossaryTermAnchorId(0)).toBe("term-0");
    expect(glossaryTermAnchorId(12)).toBe("term-12");
  });
});

describe("buildDefinedTermSetJsonLd", () => {
  test("DefinedTermSet/DefinedTerm の構造化データを組み立てる", () => {
    const jsonLd = buildDefinedTermSetJsonLd(
      [{ term: "RAG", definition: "外部文書を検索する手法" }],
      "https://example.com/glossary/",
    );
    expect(jsonLd["@type"]).toBe("DefinedTermSet");
    expect(jsonLd.hasDefinedTerm).toHaveLength(1);
    expect(jsonLd.hasDefinedTerm[0]).toEqual({
      "@type": "DefinedTerm",
      name: "RAG",
      description: "外部文書を検索する手法",
      inDefinedTermSet: "https://example.com/glossary/#glossary",
      url: "https://example.com/glossary/#term-0",
    });
  });
});
