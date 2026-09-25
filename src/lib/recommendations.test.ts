import { describe, expect, test } from "bun:test";
import recommendationsJson from "../data/recommendations.json";
import { parseRecommendationsData, resolveRecommendations } from "./recommendations";
import type { Video } from "./youtube";

const video = (id: string): Video => ({
  id,
  title: `title-${id}`,
  description: "",
  publishedAt: "2026-01-01T00:00:00Z",
  isShort: false,
  viewCount: null,
  duration: null,
});

describe("parseRecommendationsData", () => {
  test("コミット済みデータが妥当な形式である", () => {
    const data = parseRecommendationsData(recommendationsJson);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  test("必須フィールドと重複slugを検証する", () => {
    const base = {
      slug: "same",
      title: "A",
      reason: "reason",
      category: "ai",
      videoIds: ["a"],
    };
    expect(() => parseRecommendationsData({ recommendations: [{ ...base, title: "" }] })).toThrow(
      "title",
    );
    expect(() =>
      parseRecommendationsData({
        recommendations: [base, { ...base, category: "gadget" }],
      }),
    ).toThrow("slug");
  });

  test("動画IDの重複と上限を検証する", () => {
    const base = { slug: "topic", title: "A", reason: "reason", category: "ai" };
    expect(() =>
      parseRecommendationsData({
        recommendations: [{ ...base, videoIds: ["a", "a"] }],
      }),
    ).toThrow("重複");
    expect(() =>
      parseRecommendationsData({
        recommendations: [{ ...base, videoIds: ["a", "b", "c", "d", "e"] }],
      }),
    ).toThrow("1〜4");
  });
});

describe("resolveRecommendations", () => {
  test("videoIds順に代表・関連動画を解決する", () => {
    const resolved = resolveRecommendations(
      [
        {
          slug: "topic",
          title: "A",
          reason: "reason",
          category: "ai",
          videoIds: ["b", "a"],
        },
      ],
      [video("a"), video("b")],
    );
    expect(resolved[0]?.videos.map((item) => item.id)).toEqual(["b", "a"]);
  });

  test("動画が全て欠損した診断項目を除外する", () => {
    const resolved = resolveRecommendations(
      [
        {
          slug: "topic",
          title: "A",
          reason: "reason",
          category: "ai",
          videoIds: ["missing"],
        },
      ],
      [video("a")],
    );
    expect(resolved).toEqual([]);
  });
});
