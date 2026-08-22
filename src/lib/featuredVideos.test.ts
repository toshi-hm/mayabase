import { describe, expect, test } from "bun:test";
import featuredVideosJson from "../data/featured-videos.json";
import { parseFeaturedVideosData, resolveFeaturedVideos } from "./featuredVideos";
import type { Video } from "./youtube";

const video = (id: string): Video => ({
  id,
  title: `title-${id}`,
  description: "",
  publishedAt: "2026-01-01T00:00:00+09:00",
  isShort: false,
  viewCount: null,
  duration: null,
});

describe("parseFeaturedVideosData", () => {
  test("正常なデータをパースする", () => {
    const data = parseFeaturedVideosData({ featuredVideoIds: ["a", "b"] });
    expect(data.featuredVideoIds).toEqual(["a", "b"]);
  });

  test("空配列もパースできる", () => {
    const data = parseFeaturedVideosData({ featuredVideoIds: [] });
    expect(data.featuredVideoIds).toEqual([]);
  });

  test("オブジェクトでなければエラー", () => {
    expect(() => parseFeaturedVideosData(null)).toThrow();
    expect(() => parseFeaturedVideosData("invalid")).toThrow();
  });

  test("featuredVideoIds が配列でなければエラー", () => {
    expect(() => parseFeaturedVideosData({ featuredVideoIds: "a" })).toThrow();
  });

  test("featuredVideoIds に文字列以外が含まれればエラー", () => {
    expect(() => parseFeaturedVideosData({ featuredVideoIds: ["a", 1] })).toThrow();
  });

  test("コミット済みの featured-videos.json が妥当な形式である", () => {
    const data = parseFeaturedVideosData(featuredVideosJson);
    expect(Array.isArray(data.featuredVideoIds)).toBe(true);
  });
});

describe("resolveFeaturedVideos", () => {
  const videos = [video("a"), video("b"), video("c")];

  test("featuredVideoIds の順序を維持して解決する", () => {
    const resolved = resolveFeaturedVideos(["c", "a"], videos);
    expect(resolved.map((v) => v.id)).toEqual(["c", "a"]);
  });

  test("videos に存在しない ID は黙ってスキップする", () => {
    const resolved = resolveFeaturedVideos(["a", "deleted", "b"], videos);
    expect(resolved.map((v) => v.id)).toEqual(["a", "b"]);
  });

  test("featuredVideoIds が空なら空配列を返す", () => {
    expect(resolveFeaturedVideos([], videos)).toEqual([]);
  });
});
