import { describe, expect, test } from "bun:test";
import { getRelatedVideos } from "./relatedVideos";
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
});
