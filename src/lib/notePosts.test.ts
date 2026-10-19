import { describe, expect, test } from "bun:test";
import { extractExcerpt, parseNoteRss } from "./notePosts";

function item(overrides: Record<string, string> = {}): string {
  const f = {
    title: "記事タイトル",
    link: "https://note.com/maya_base/n/n1",
    pubDate: "Sun, 18 Oct 2026 23:23:16 +0900",
    thumb: "https://assets.st-note.com/production/uploads/images/1/a.png?width=800",
    description:
      "<![CDATA[<p>本文の冒頭です。</p><br/><a href='https://note.com/maya_base/n/n1'>続きをみる</a>]]>",
    ...overrides,
  };
  return `<item><title>${f.title}</title><media:thumbnail>${f.thumb}</media:thumbnail><description>${f.description}</description><pubDate>${f.pubDate}</pubDate><link>${f.link}</link></item>`;
}

const wrap = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>${items}</channel></rss>`;

describe("parseNoteRss", () => {
  test("新しい順に最大件数まで返す", () => {
    const xml = wrap(
      [
        item({
          link: "https://note.com/maya_base/n/a",
          pubDate: "Mon, 01 Jun 2026 00:00:00 +0900",
        }),
        item({
          link: "https://note.com/maya_base/n/c",
          pubDate: "Wed, 01 Jul 2026 00:00:00 +0900",
        }),
        item({
          link: "https://note.com/maya_base/n/b",
          pubDate: "Wed, 01 Jul 2026 12:00:00 +0900",
        }),
      ].join(""),
    );
    const posts = parseNoteRss(xml, 2);
    expect(posts.map((p) => p.url)).toEqual([
      "https://note.com/maya_base/n/b",
      "https://note.com/maya_base/n/c",
    ]);
  });

  test("1件のみでも配列として扱い、抜粋から続きをみるを除く", () => {
    const [post] = parseNoteRss(wrap(item()));
    expect(post?.excerpt).toBe("本文の冒頭です。");
    expect(post?.publishedAt).toBe("2026-10-18T14:23:16.000Z");
    expect(post?.thumbnail).toContain("assets.st-note.com");
  });

  test("note 以外のホストや http の記事・不正な日付は除外する", () => {
    const xml = wrap(
      [
        item({ link: "https://evil.example.com/n/1" }),
        item({ link: "http://note.com/maya_base/n/2" }),
        item({ pubDate: "invalid" }),
        item({ link: "javascript:alert(1)" }),
      ].join(""),
    );
    expect(parseNoteRss(xml)).toEqual([]);
  });

  test("許可外のサムネイルホストは null にする", () => {
    const [post] = parseNoteRss(wrap(item({ thumb: "https://evil.example.com/x.png" })));
    expect(post?.thumbnail).toBeNull();
  });

  test("item が無い・RSS でない入力は空配列", () => {
    expect(parseNoteRss(wrap(""))).toEqual([]);
    expect(parseNoteRss("<html></html>")).toEqual([]);
  });
});

describe("extractExcerpt", () => {
  test("長文は切り詰めて省略記号を付ける", () => {
    expect(extractExcerpt(`<p>${"あ".repeat(100)}</p>`, 10)).toBe(`${"あ".repeat(10)}…`);
  });
});
