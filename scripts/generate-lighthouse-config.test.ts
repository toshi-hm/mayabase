import { describe, expect, test } from "bun:test";
import { selectVideoPaths, splitUrlsForShard } from "./generate-lighthouse-config";

describe("selectVideoPaths", () => {
  test("公開日が新しい実在動画を優先する", () => {
    expect(
      selectVideoPaths(
        [
          { id: "old", publishedAt: "2026-01-01T00:00:00Z" },
          { id: "new", publishedAt: "2026-02-01T00:00:00Z" },
        ],
        ["old", "new"],
      ),
    ).toEqual(["/videos/new/index.html", "/videos/old/index.html"]);
  });

  test("videos.jsonにない実在ディレクトリへフォールバックする", () => {
    expect(
      selectVideoPaths(
        [{ id: "missing", publishedAt: "2026-02-01T00:00:00Z" }],
        ["category", "series", "available"],
      ),
    ).toEqual(["/videos/available/index.html"]);
  });
});

describe("splitUrlsForShard", () => {
  const urls = ["a", "b", "c", "d", "e", "f", "g"];

  test("shardCountが1以下なら全URLをそのまま返す", () => {
    expect(splitUrlsForShard(urls, 1, 1)).toEqual(urls);
    expect(splitUrlsForShard(urls, 1, 0)).toEqual(urls);
  });

  test("URLをshardCount個のグループへ均等に振り分ける", () => {
    expect(splitUrlsForShard(urls, 1, 3)).toEqual(["a", "d", "g"]);
    expect(splitUrlsForShard(urls, 2, 3)).toEqual(["b", "e"]);
    expect(splitUrlsForShard(urls, 3, 3)).toEqual(["c", "f"]);
  });

  test("全shardの結果を合わせると重複・欠落なく元のURL集合と一致する", () => {
    const shardCount = 4;
    const merged = Array.from({ length: shardCount }, (_, i) =>
      splitUrlsForShard(urls, i + 1, shardCount),
    ).flat();
    expect(merged.toSorted()).toEqual(urls.toSorted());
  });

  test("範囲外のshardIndexはエラーを投げる", () => {
    expect(() => splitUrlsForShard(urls, 0, 3)).toThrow();
    expect(() => splitUrlsForShard(urls, 4, 3)).toThrow();
  });
});
