import { describe, expect, test } from "bun:test";
import featuredTopicsJson from "../data/featured-topics.json";
import type { Video } from "./youtube";
import { parseFeaturedTopicsData, resolveFeaturedTopics } from "./featuredTopics";

const video = (id: string): Video => ({
  id,
  title: `title-${id}`,
  description: "",
  publishedAt: "2026-01-01T00:00:00Z",
  isShort: false,
  viewCount: null,
  duration: null,
});

describe("parseFeaturedTopicsData", () => {
  test("コミット済みデータが妥当な形式である", () => {
    const data = parseFeaturedTopicsData(featuredTopicsJson);
    expect(data.topics.length).toBeGreaterThan(0);
  });

  test("重複slugを拒否する", () => {
    expect(() =>
      parseFeaturedTopicsData({
        topics: [
          {
            slug: "same",
            title: "A",
            description: "A",
            category: "ai",
            videoIds: ["a"],
          },
          {
            slug: "same",
            title: "B",
            description: "B",
            category: "ai",
            videoIds: ["b"],
          },
        ],
      }),
    ).toThrow("slug");
  });

  test("videoIdsの重複と上限超過を拒否する", () => {
    const base = {
      slug: "topic",
      title: "A",
      description: "A",
      category: "ai",
    };
    expect(() => parseFeaturedTopicsData({ topics: [{ ...base, videoIds: ["a", "a"] }] })).toThrow(
      "重複",
    );
    expect(() =>
      parseFeaturedTopicsData({ topics: [{ ...base, videoIds: ["a", "b", "c", "d", "e"] }] }),
    ).toThrow("1〜4");
  });

  test("カテゴリと期限を検証する", () => {
    const base = { slug: "topic", title: "A", description: "A", videoIds: ["a"] };
    expect(() =>
      parseFeaturedTopicsData({ topics: [{ ...base, category: "unknown" }] }),
    ).toThrow("category");
    expect(() =>
      parseFeaturedTopicsData({ topics: [{ ...base, category: "ai", expiresAt: "invalid" }] }),
    ).toThrow("expiresAt");
  });
});

describe("resolveFeaturedTopics", () => {
  const videos = [video("a"), video("b"), video("c")];

  test("代表動画からvideoIds順に解決する", () => {
    const topics = resolveFeaturedTopics(
      [
        {
          slug: "topic",
          title: "A",
          description: "A",
          category: "ai",
          videoIds: ["b", "a"],
        },
      ],
      videos,
    );
    expect(topics[0]?.videos.map((item) => item.id)).toEqual(["b", "a"]);
  });

  test("欠損動画だけのテーマは除外する", () => {
    const [topic] = resolveFeaturedTopics(
      [
        {
          slug: "topic",
          title: "A",
          description: "A",
          category: "ai",
          videoIds: ["missing"],
        },
      ],
      videos,
    );
    expect(topic).toBeUndefined();
  });

  test("期限切れテーマを除外する", () => {
    const [topic] = resolveFeaturedTopics(
      [
        {
          slug: "topic",
          title: "A",
          description: "A",
          category: "ai",
          videoIds: ["a"],
          expiresAt: "2026-01-01",
        },
      ],
      videos,
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(topic).toBeUndefined();
  });
});
