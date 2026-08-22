import { describe, expect, test } from "bun:test";
import { getAdjacentVideos, getRelatedVideos } from "./relatedVideos";
import type { Video } from "./youtube";

// カテゴリ判定はタイトルに依存する(categorizeVideo)ため、テスト用動画のタイトルは
// 意図したカテゴリに確実に判定されるキーワードを含める。
const video = (id: string, title: string, publishedAt: string): Video => ({
  id,
  title,
  description: "",
  publishedAt,
  isShort: false,
  viewCount: null,
  duration: null,
});

describe("getRelatedVideos", () => {
  const target = video("target", "ChatGPT の新機能を試す", "2026-06-01T00:00:00+09:00");
  const sameCategoryNewer = video("newer", "GPT-5 レビュー", "2026-07-01T00:00:00+09:00");
  const sameCategoryOlder = video("older", "OpenAI の新発表", "2026-01-01T00:00:00+09:00");
  const otherCategory = video("other", "【平日Vlog】在宅勤務の1日", "2026-06-15T00:00:00+09:00");

  const videos = [target, sameCategoryNewer, sameCategoryOlder, otherCategory];

  test("同カテゴリの動画のみを返す", () => {
    const related = getRelatedVideos(target, videos, "ai", 10);
    expect(related.map((v) => v.id).sort()).toEqual(["newer", "older"]);
  });

  test("自分自身は除外する", () => {
    const related = getRelatedVideos(target, videos, "ai", 10);
    expect(related.some((v) => v.id === target.id)).toBe(false);
  });

  test("公開日の新しい順に並ぶ", () => {
    const related = getRelatedVideos(target, videos, "ai", 10);
    expect(related.map((v) => v.id)).toEqual(["newer", "older"]);
  });

  test("上限件数で打ち切る", () => {
    const related = getRelatedVideos(target, videos, "ai", 1);
    expect(related).toHaveLength(1);
    expect(related[0]?.id).toBe("newer");
  });

  test("同カテゴリの動画が無ければ空配列", () => {
    const related = getRelatedVideos(target, [target, otherCategory], "career", 10);
    expect(related).toEqual([]);
  });

  test("不正なpublishedAtの動画はNaN比較にならず末尾に並ぶ", () => {
    const invalidDate = video("invalid", "GPT の使い方まとめ", "not-a-date");
    const related = getRelatedVideos(target, [target, sameCategoryNewer, invalidDate], "ai", 10);
    expect(related.map((v) => v.id)).toEqual(["newer", "invalid"]);
  });
});

describe("getAdjacentVideos", () => {
  const target = video("target", "ChatGPT の新機能を試す", "2026-06-01T00:00:00+09:00");
  const newer = video("newer", "GPT-5 レビュー", "2026-07-01T00:00:00+09:00");
  const older = video("older", "OpenAI の新発表", "2026-01-01T00:00:00+09:00");
  const videos = [target, newer, older];

  test("公開日が1つ前後の動画を返す", () => {
    const adjacent = getAdjacentVideos(target, videos);
    expect(adjacent.older?.id).toBe("older");
    expect(adjacent.newer?.id).toBe("newer");
  });

  test("呼び出し元の順序に依存しない(未整列でも正しく判定する)", () => {
    const adjacent = getAdjacentVideos(target, [older, newer, target]);
    expect(adjacent.older?.id).toBe("older");
    expect(adjacent.newer?.id).toBe("newer");
  });

  test("最新の動画は newer が null", () => {
    const adjacent = getAdjacentVideos(newer, videos);
    expect(adjacent.newer).toBeNull();
    expect(adjacent.older?.id).toBe("target");
  });

  test("最古の動画は older が null", () => {
    const adjacent = getAdjacentVideos(older, videos);
    expect(adjacent.older).toBeNull();
    expect(adjacent.newer?.id).toBe("target");
  });

  test("動画が1件のみなら両方 null", () => {
    const adjacent = getAdjacentVideos(target, [target]);
    expect(adjacent.older).toBeNull();
    expect(adjacent.newer).toBeNull();
  });

  test("対象動画が videos に含まれなければ両方 null", () => {
    const adjacent = getAdjacentVideos(target, [newer, older]);
    expect(adjacent.older).toBeNull();
    expect(adjacent.newer).toBeNull();
  });
});
