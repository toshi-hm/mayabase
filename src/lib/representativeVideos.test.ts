import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import { categorizeVideo } from "./categories";
import { pickRepresentativeVideos, REVIEW_CATEGORIES } from "./representativeVideos";
import type { Video } from "./youtube";
import { parseVideosData } from "./youtube";

function v(id: string, title: string, viewCount: number | null, isShort = false): Video {
  return {
    id,
    title,
    description: "",
    publishedAt: "2026-01-01T00:00:00Z",
    isShort,
    viewCount,
    duration: null,
  };
}

describe("pickRepresentativeVideos", () => {
  const career = v("c1", "AI大学院を卒業しました", 9000);
  const g1 = v("g1", "ガジェット購入品レビュー", 500);
  const g2 = v("g2", "キーボードを開封", 300);
  const a1 = v("a1", "ChatGPTの使い方", 400);
  const a2 = v("a2", "Claudeを試した", 200);

  test("レビュー系を再生回数が多くても非レビュー系より優先する", () => {
    const ids = pickRepresentativeVideos([career, g1, a1], 2).map((x) => x.id);
    expect(ids).toEqual(["g1", "a1"]);
  });

  test("ガジェットとAIを交互に選びジャンルが偏らない", () => {
    const ids = pickRepresentativeVideos([g1, g2, a1, a2], 4).map((x) => x.id);
    expect(ids).toEqual(["g1", "a1", "g2", "a2"]);
    expect(pickRepresentativeVideos([g1, g2, a1, a2], 2).map((x) => x.id)).toEqual(["g1", "a1"]);
  });

  test("長尺を優先し、足りない場合のみShortsを使う", () => {
    const s = v("s1", "ガジェット紹介", 9999, true);
    expect(pickRepresentativeVideos([s, g1], 1).map((x) => x.id)).toEqual(["g1"]);
    expect(pickRepresentativeVideos([s, g1], 2).map((x) => x.id)).toEqual(["g1", "s1"]);
  });

  test("レビュー系が足りなければ他カテゴリで補う(キャリアは最後)", () => {
    const vlog = v("v1", "休日のVlog", 100);
    expect(pickRepresentativeVideos([career, vlog, g1], 3).map((x) => x.id)).toEqual([
      "g1",
      "v1",
      "c1",
    ]);
  });

  test("再生回数が未取得の動画・limit 0・空配列を扱える", () => {
    expect(pickRepresentativeVideos([v("n", "ガジェット", null)], 4)).toEqual([]);
    expect(pickRepresentativeVideos([g1], 0)).toEqual([]);
    expect(pickRepresentativeVideos([], 4)).toEqual([]);
  });

  test("重複せず limit を超えない(実データ)", () => {
    const { videos } = parseVideosData(videosJson);
    const picked = pickRepresentativeVideos(videos, 4);
    expect(picked.length).toBeLessThanOrEqual(4);
    expect(new Set(picked.map((x) => x.id)).size).toBe(picked.length);
    const reviewCount = picked.filter((x) => REVIEW_CATEGORIES.includes(categorizeVideo(x))).length;
    const available = videos.filter(
      (x) => x.viewCount !== null && REVIEW_CATEGORIES.includes(categorizeVideo(x)),
    ).length;
    expect(reviewCount).toBe(Math.min(available, picked.length));
  });
});
