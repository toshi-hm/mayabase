import { describe, expect, test } from "bun:test";
import { selectVideoPaths } from "./generate-lighthouse-config";

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
        ["available"],
      ),
    ).toEqual(["/videos/available/index.html"]);
  });
});
