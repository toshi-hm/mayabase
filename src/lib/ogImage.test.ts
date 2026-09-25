import { describe, expect, test } from "bun:test";
import { buildOgImageSvg, wrapOgTitle } from "./ogImage";

describe("wrapOgTitle", () => {
  test("日本語タイトルを最大3行に収める", () => {
    expect(wrapOgTitle("よくある質問")).toEqual(["よくある質問"]);
    expect(wrapOgTitle("あ".repeat(60))).toHaveLength(3);
    expect(wrapOgTitle("あ".repeat(60)).at(-1)).toContain("…");
  });

  test("空白だけのタイトルは空行として扱う", () => {
    expect(wrapOgTitle("   ")).toEqual([""]);
  });
});

describe("buildOgImageSvg", () => {
  test("タイトルと説明をXMLエスケープする", () => {
    const svg = buildOgImageSvg({ title: "<危険&タイトル>", subtitle: '"説明"' });
    expect(svg).toContain("&lt;危険&amp;タイトル&gt;");
    expect(svg).toContain("&quot;説明&quot;");
    expect(svg).not.toContain("<危険&タイトル>");
  });
});
