import { describe, expect, test } from "bun:test";
import { sitemapLastmod } from "./sitemapLastmod";

const SITE = "https://portal.mayabase.workers.dev";
const videos = [
  { id: "aaa", publishedAt: "2026-09-01T09:00:00Z" },
  { id: "-bb_", publishedAt: "2026-10-01T09:00:00Z" },
  { id: "bad", publishedAt: "not-a-date" },
];

describe("sitemapLastmod", () => {
  test("動画詳細ページはその動画の公開日時を返す", () => {
    expect(sitemapLastmod(`${SITE}/videos/aaa/`, videos, SITE)).toBe("2026-09-01T09:00:00.000Z");
    expect(sitemapLastmod(`${SITE}/videos/-bb_/`, videos, SITE)).toBe("2026-10-01T09:00:00.000Z");
  });

  test("未知の動画や公開日時が不正な動画は undefined", () => {
    expect(sitemapLastmod(`${SITE}/videos/zzz/`, videos, SITE)).toBeUndefined();
    expect(sitemapLastmod(`${SITE}/videos/bad/`, videos, SITE)).toBeUndefined();
  });

  test("トップと動画一覧は最新の公開日時を返す", () => {
    expect(sitemapLastmod(`${SITE}/`, videos, SITE)).toBe("2026-10-01T09:00:00.000Z");
    expect(sitemapLastmod(`${SITE}/videos/`, videos, SITE)).toBe("2026-10-01T09:00:00.000Z");
  });

  test("有効な動画が無ければトップも undefined", () => {
    expect(sitemapLastmod(`${SITE}/`, [], SITE)).toBeUndefined();
  });

  test("カテゴリ・シリーズ・その他のページは undefined", () => {
    expect(sitemapLastmod(`${SITE}/videos/category/ai/`, videos, SITE)).toBeUndefined();
    expect(sitemapLastmod(`${SITE}/videos/series/`, videos, SITE)).toBeUndefined();
    expect(sitemapLastmod(`${SITE}/faq/`, videos, SITE)).toBeUndefined();
  });

  test("不正なURLは undefined", () => {
    expect(sitemapLastmod("http://[", videos, SITE)).toBeUndefined();
  });
});
