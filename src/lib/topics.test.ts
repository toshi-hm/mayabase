import { describe, expect, test } from "bun:test";
import { buildTopicsIndex, topicTextMatches } from "./topics";
import type { Video } from "./youtube";

function makeVideo(overrides: Partial<Video> & { id: string }): Video {
  return {
    title: "サンプル動画",
    description: "",
    publishedAt: "2026-08-01T00:00:00Z",
    isShort: false,
    viewCount: null,
    duration: null,
    ...overrides,
  };
}

const CHAPTERED_DESCRIPTION = ["0:00 導入", "1:23 本編", "5:10 まとめ"].join("\n");

describe("buildTopicsIndex", () => {
  test("チャプターを持つ動画から videoId・videoTitle 付きのフラットなリストを作る", () => {
    const videos = [makeVideo({ id: "a", title: "動画A", description: CHAPTERED_DESCRIPTION })];
    expect(buildTopicsIndex(videos)).toEqual([
      { videoId: "a", videoTitle: "動画A", isShort: false, label: "導入", seconds: 0 },
      { videoId: "a", videoTitle: "動画A", isShort: false, label: "本編", seconds: 83 },
      { videoId: "a", videoTitle: "動画A", isShort: false, label: "まとめ", seconds: 310 },
    ]);
  });

  test("チャプター条件を満たさない動画(3件未満等)は含めない", () => {
    const videos = [
      makeVideo({ id: "a", description: "0:00 導入\n1:23 まとめ" }),
      makeVideo({ id: "b", description: "特にチャプターの無い概要欄です。" }),
    ];
    expect(buildTopicsIndex(videos)).toEqual([]);
  });

  test("複数動画のチャプターを、動画の並び順・動画内の時系列順を維持して集約する", () => {
    const videos = [
      makeVideo({ id: "a", title: "動画A", description: CHAPTERED_DESCRIPTION }),
      makeVideo({ id: "b", title: "動画B", description: CHAPTERED_DESCRIPTION }),
    ];
    const topics = buildTopicsIndex(videos);
    expect(topics.map((t) => `${t.videoId}:${t.label}`)).toEqual([
      "a:導入",
      "a:本編",
      "a:まとめ",
      "b:導入",
      "b:本編",
      "b:まとめ",
    ]);
  });

  test("動画が0件、またはどの動画にもチャプターが無ければ空配列を返す", () => {
    expect(buildTopicsIndex([])).toEqual([]);
    expect(buildTopicsIndex([makeVideo({ id: "a" })])).toEqual([]);
  });
});

describe("topicTextMatches", () => {
  test("チャプターの見出しに一致すれば true", () => {
    expect(topicTextMatches("セットアップ手順", "動画タイトル", "セットアップ")).toBe(true);
  });

  test("動画タイトルに一致すれば true", () => {
    expect(topicTextMatches("導入", "在宅勤務Vlog", "在宅勤務")).toBe(true);
  });

  test("どちらにも一致しなければ false", () => {
    expect(topicTextMatches("導入", "在宅勤務Vlog", "存在しないキーワード")).toBe(false);
  });

  test("空クエリは常に true", () => {
    expect(topicTextMatches("導入", "在宅勤務Vlog", "")).toBe(true);
  });
});
