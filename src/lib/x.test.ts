import { describe, expect, test } from "bun:test";
import xPostsJson from "../data/x-posts.json";
import {
  buildVideoPostDraft,
  formatVideoPostDraftSummary,
  parseXPostsData,
  postUrl,
  shareIntentUrl,
} from "./x";

describe("postUrl", () => {
  test("status URL を生成する", () => {
    expect(postUrl("MayaBaseJP", "1234567890")).toBe("https://x.com/MayaBaseJP/status/1234567890");
  });
});

describe("shareIntentUrl", () => {
  test("text と url をクエリパラメータとして付与する", () => {
    const result = shareIntentUrl("動画タイトル", "https://www.youtube.com/watch?v=abc123");
    const parsed = new URL(result);
    expect(parsed.origin + parsed.pathname).toBe("https://x.com/intent/tweet");
    expect(parsed.searchParams.get("text")).toBe("動画タイトル");
    expect(parsed.searchParams.get("url")).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("& や # を含む文字列も安全にエンコードする", () => {
    const result = shareIntentUrl("A&B #tag", "https://example.com/?q=1&r=2");
    const parsed = new URL(result);
    expect(parsed.searchParams.get("text")).toBe("A&B #tag");
    expect(parsed.searchParams.get("url")).toBe("https://example.com/?q=1&r=2");
  });
});

describe("buildVideoPostDraft", () => {
  test("新着動画の本文とX投稿インテントURLを生成する", () => {
    const draft = buildVideoPostDraft({
      id: "abc123",
      isShort: false,
      title: "新しい動画 & レビュー",
    });
    const parsed = new URL(draft.url);
    expect(draft.text).toBe("🎬 新着動画: 新しい動画 & レビュー");
    expect(parsed.searchParams.get("text")).toBe(draft.text);
    expect(parsed.searchParams.get("url")).toBe("https://www.youtube.com/watch?v=abc123");
  });
});

describe("formatVideoPostDraftSummary", () => {
  test("タイトルをHTMLエスケープしてサマリー向けに整形する", () => {
    const summary = formatVideoPostDraftSummary({
      id: "abc123",
      isShort: false,
      title: '[リンク] <img src="https://example.com/track.gif"> & 詳細',
    });
    expect(summary).toContain(
      "<code>[リンク] &lt;img src=&quot;https://example.com/track.gif&quot;&gt; &amp; 詳細</code>",
    );
    expect(summary).not.toContain("<img src=");
  });
});

describe("parseXPostsData", () => {
  test("正常なデータをパースし新しい順に整列する", () => {
    const data = parseXPostsData({
      account: "MayaBaseJP",
      posts: [
        { id: "1", text: "古い投稿", date: "2026-01-01T00:00:00+09:00" },
        { id: "2", text: "新しい投稿", date: "2026-07-01T00:00:00+09:00" },
      ],
    });
    expect(data.posts.map((p) => p.id)).toEqual(["2", "1"]);
  });

  test("account の @ 付きはエラー", () => {
    expect(() => parseXPostsData({ account: "@MayaBaseJP", posts: [] })).toThrow();
  });

  test("id が数字列でなければエラー", () => {
    expect(() =>
      parseXPostsData({
        account: "MayaBaseJP",
        posts: [{ id: "abc", text: "テスト", date: "2026-01-01T00:00:00+09:00" }],
      }),
    ).toThrow();
  });

  test("date が不正ならエラー", () => {
    expect(() =>
      parseXPostsData({
        account: "MayaBaseJP",
        posts: [{ id: "1", text: "テスト", date: "not-a-date" }],
      }),
    ).toThrow();
  });

  test("コミット済みの x-posts.json が妥当な形式である", () => {
    const data = parseXPostsData(xPostsJson);
    expect(data.account).toBe("MayaBaseJP");
  });
});
