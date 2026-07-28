import { describe, expect, test } from "bun:test";
import { buildBreadcrumbJsonLd } from "./breadcrumb";

const SITE_URL = "https://portal.mayabase.workers.dev/";

describe("buildBreadcrumbJsonLd", () => {
  test("position が 1 始まりで連番になる", () => {
    const result = buildBreadcrumbJsonLd(
      [
        { name: "ホーム", href: "/" },
        { name: "動画ライブラリ", href: "/videos/" },
      ],
      SITE_URL,
    );
    expect(result.map((r) => r.position)).toEqual([1, 2]);
  });

  test("href をサイト URL 起点の絶対 URL に解決する", () => {
    const result = buildBreadcrumbJsonLd(
      [
        { name: "ホーム", href: "/" },
        { name: "愛用ガジェット", href: "/gear/" },
      ],
      SITE_URL,
    );
    expect(result[0]?.item).toBe("https://portal.mayabase.workers.dev/");
    expect(result[1]?.item).toBe("https://portal.mayabase.workers.dev/gear/");
  });

  test("name をそのまま引き継ぐ", () => {
    const result = buildBreadcrumbJsonLd([{ name: "よくある質問", href: "/faq/" }], SITE_URL);
    expect(result[0]?.name).toBe("よくある質問");
    expect(result[0]?.["@type"]).toBe("ListItem");
  });

  test("空配列を渡すと空配列を返す", () => {
    expect(buildBreadcrumbJsonLd([], SITE_URL)).toEqual([]);
  });
});
