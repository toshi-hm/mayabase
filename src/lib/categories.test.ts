import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categorizeVideo,
  categoryUrl,
  getAvailableCategories,
} from "./categories";
import { parseVideosData } from "./youtube";

describe("categorizeVideo", () => {
  test("AI 系のタイトルは ai になる", () => {
    expect(
      categorizeVideo({ title: "【驚愕】まるで人間。ChatGPTの新音声モデルは私の新しい相棒" }),
    ).toBe("ai");
    expect(
      categorizeVideo({ title: "【驚愕】人間そっくり!? OpenAI最新音声AI「GPT-Live」がヤバすぎる" }),
    ).toBe("ai");
  });

  test("ガジェット・家電系のタイトルは gadget になる", () => {
    expect(
      categorizeVideo({ title: "【家電】料理を自動化！ティファールの時短家電を徹底検証" }),
    ).toBe("gadget");
    expect(categorizeVideo({ title: 'もう置かない！スマホに"貼る"ドッキングステーション' })).toBe(
      "gadget",
    );
    expect(categorizeVideo({ title: "【購入品紹介】Qoo10メガ割で肌荒れ・毛穴対策" })).toBe(
      "gadget",
    );
  });

  test("Vlog 系のタイトルは vlog になる", () => {
    expect(categorizeVideo({ title: "【平日Vlog】ITメガベンチャー3年目のリアルな日常" })).toBe(
      "vlog",
    );
    expect(categorizeVideo({ title: "【GW旅行Vlog】淡路島・香川・徳島を満喫！" })).toBe("vlog");
  });

  test("キャリア系のタイトルは career になる", () => {
    expect(categorizeVideo({ title: "エンジニア就活生必見！事業会社 vs SIer" })).toBe("career");
    expect(
      categorizeVideo({ title: "【報告】メガベンチャーITエンジニアのキャリア戦略と今後" }),
    ).toBe("career");
  });

  test("career は ai より優先される(AI 大学院の卒業報告など)", () => {
    expect(
      categorizeVideo({ title: "【ついに修了】働きながらAI大学院を卒業！学位授与式の1日" }),
    ).toBe("career");
  });

  test("vlog より gadget が優先されるのは機材キーワードを含む場合のみ", () => {
    // 「買ってよかった◯◯」程度では gadget 扱いにせず、Vlog 主体の動画は vlog に落とす
    expect(
      categorizeVideo({ title: "出社日Vlog | 買ってよかった最新自動調理鍋で作る平日夜ご飯" }),
    ).toBe("vlog");
  });

  test("英数字キーワードは単語境界で照合する(AirPods は AI に誤マッチしない)", () => {
    expect(categorizeVideo({ title: "AirPods を試してみた" })).toBe("other");
    expect(categorizeVideo({ title: "音声AIを試してみた" })).toBe("ai");
  });

  test("大文字小文字を区別しない", () => {
    expect(categorizeVideo({ title: "chatgpt を使ってみた" })).toBe("ai");
    expect(categorizeVideo({ title: "vlog: とある休日" })).toBe("vlog");
  });

  test("過去動画で使われる固有表現を分類できる", () => {
    expect(categorizeVideo({ title: "新卒エンジニアの二足のわらじ" })).toBe("career");
    expect(categorizeVideo({ title: "愛用コーヒーメーカーと体重計" })).toBe("gadget");
    expect(categorizeVideo({ title: "Maya のライブ配信" })).toBe("vlog");
  });

  test("「二足のわらじ」は定番ハッシュタグとして全動画に付与されるため、単独では career と判定しない(#68)", () => {
    // career 特有語(新卒・大学院等)を含まない Vlog 系動画まで career に吸収されないこと
    expect(categorizeVideo({ title: "休日ドライブ - 山梨 【二足のわらじ】" })).toBe("vlog");
    expect(categorizeVideo({ title: "週5日 在宅勤務でした。【二足のわらじ】" })).toBe("vlog");
  });

  test("「1日」キーワードは日付表記(◯月31日等)に誤マッチしない", () => {
    expect(categorizeVideo({ title: "12月31日の記録" })).toBe("other");
    expect(categorizeVideo({ title: "2026年1月21日のこと" })).toBe("other");
  });

  test("どのキーワードにも該当しなければ other になる", () => {
    expect(categorizeVideo({ title: "タイトル未定" })).toBe("other");
    expect(categorizeVideo({ title: "" })).toBe("other");
  });

  test("実データの全動画が other 以外に分類される(回帰テスト)", () => {
    const { videos } = parseVideosData(videosJson);
    expect(videos.length).toBeGreaterThan(0);
    for (const video of videos) {
      expect(categorizeVideo(video)).not.toBe("other");
    }
  });
});

describe("カテゴリ定義", () => {
  test("CATEGORY_ORDER は全カテゴリを一度ずつ含む", () => {
    const orderedKeys: string[] = [...CATEGORY_ORDER];
    expect(orderedKeys.sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
  });
});

describe("categoryUrl", () => {
  test("カテゴリ別静的アーカイブページの URL を組み立てる", () => {
    expect(categoryUrl("ai")).toBe("/videos/category/ai/");
    expect(categoryUrl("gadget")).toBe("/videos/category/gadget/");
    expect(categoryUrl("vlog")).toBe("/videos/category/vlog/");
    expect(categoryUrl("career")).toBe("/videos/category/career/");
    expect(categoryUrl("other")).toBe("/videos/category/other/");
  });
});

describe("getAvailableCategories", () => {
  test("動画が 1 件でもあるカテゴリのみを CATEGORY_ORDER の順序で返す", () => {
    const categorized = [{ category: "vlog" as const }, { category: "ai" as const }];
    expect(getAvailableCategories(categorized)).toEqual(["ai", "vlog"]);
  });

  test("動画が 0 件のカテゴリは含めない", () => {
    const categorized = [{ category: "ai" as const }];
    expect(getAvailableCategories(categorized)).toEqual(["ai"]);
    expect(getAvailableCategories(categorized)).not.toContain("gadget");
    expect(getAvailableCategories(categorized)).not.toContain("other");
  });

  test("動画が 1 件も無ければ空配列を返す", () => {
    expect(getAvailableCategories([])).toEqual([]);
  });

  test("実データでは categorizeVideo が other を返さないため other は含まれない(回帰テスト)", () => {
    const { videos } = parseVideosData(videosJson);
    const categorized = videos.map((video) => ({ category: categorizeVideo(video) }));
    expect(getAvailableCategories(categorized)).not.toContain("other");
  });

  test("実データの各カテゴリの getStaticPaths 用動画一覧が 1 件以上になる", () => {
    // src/pages/videos/category/[category].astro の getStaticPaths が生成するページ数と
    // 各ページの動画一覧が 0 件にならないことの回帰テスト(#121)
    const { videos } = parseVideosData(videosJson);
    const categorized = videos.map((video) => ({ video, category: categorizeVideo(video) }));
    const available = getAvailableCategories(categorized);
    expect(available.length).toBeGreaterThan(0);
    for (const category of available) {
      const categoryVideos = categorized.filter((entry) => entry.category === category);
      expect(categoryVideos.length).toBeGreaterThan(0);
    }
  });
});
