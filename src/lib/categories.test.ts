import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import { CATEGORY_LABELS, CATEGORY_ORDER, categorizeVideo } from "./categories";
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
