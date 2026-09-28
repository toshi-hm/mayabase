import { describe, expect, test } from "bun:test";
import { communityPostUrl, parseCommunityPostsData, resolveCommunityPosts } from "./communityPosts";

const videos = [
  {
    id: "abc12345678",
    title: "HHKBキーボードのレビュー",
    description: "",
    publishedAt: "2026-01-01T00:00:00Z",
    isShort: false,
    viewCount: null,
    duration: null,
  },
];

describe("parseCommunityPostsData", () => {
  test("空配列を許容する", () => {
    expect(parseCommunityPostsData({ posts: [] })).toEqual({ posts: [] });
  });

  test("投稿を新しい順に整列する", () => {
    const { posts } = parseCommunityPostsData({
      posts: [
        { id: "older", text: "古い投稿", date: "2026-01-01T00:00:00Z" },
        { id: "newer", text: "新しい投稿", date: "2026-02-01T00:00:00Z" },
      ],
    });
    expect(posts.map((p) => p.id)).toEqual(["newer", "older"]);
  });

  test("relatedVideoId は任意である", () => {
    const { posts } = parseCommunityPostsData({
      posts: [{ id: "post1", text: "本文", date: "2026-01-01T00:00:00Z" }],
    });
    expect(posts[0]?.relatedVideoId).toBeUndefined();
  });

  test("relatedVideoId を保持する", () => {
    const { posts } = parseCommunityPostsData({
      posts: [
        {
          id: "post1",
          text: "本文",
          date: "2026-01-01T00:00:00Z",
          relatedVideoId: "abc12345678",
        },
      ],
    });
    expect(posts[0]?.relatedVideoId).toBe("abc12345678");
  });

  test("オブジェクトでないデータは throw する", () => {
    expect(() => parseCommunityPostsData(null)).toThrow();
    expect(() => parseCommunityPostsData([])).toThrow();
  });

  test("posts が配列でない場合は throw する", () => {
    expect(() => parseCommunityPostsData({ posts: "invalid" })).toThrow();
  });

  test("id が不正な形式の場合は throw する", () => {
    expect(() =>
      parseCommunityPostsData({ posts: [{ id: "不正 id", text: "本文", date: "2026-01-01" }] }),
    ).toThrow();
  });

  test("id が重複している場合は throw する", () => {
    expect(() =>
      parseCommunityPostsData({
        posts: [
          { id: "dup", text: "本文1", date: "2026-01-01T00:00:00Z" },
          { id: "dup", text: "本文2", date: "2026-01-02T00:00:00Z" },
        ],
      }),
    ).toThrow();
  });

  test("text が空文字の場合は throw する", () => {
    expect(() =>
      parseCommunityPostsData({ posts: [{ id: "post1", text: "", date: "2026-01-01" }] }),
    ).toThrow();
  });

  test("date が ISO 8601 として解釈できない場合は throw する", () => {
    expect(() =>
      parseCommunityPostsData({
        posts: [{ id: "post1", text: "本文", date: "不正な日付" }],
      }),
    ).toThrow();
  });

  test("relatedVideoId が文字列でない場合は throw する", () => {
    expect(() =>
      parseCommunityPostsData({
        posts: [{ id: "post1", text: "本文", date: "2026-01-01T00:00:00Z", relatedVideoId: 1 }],
      }),
    ).toThrow();
  });
});

describe("communityPostUrl", () => {
  test("投稿IDからYouTube公式の投稿URLを組み立てる", () => {
    expect(communityPostUrl("abc123")).toBe("https://www.youtube.com/post/abc123");
  });
});

describe("resolveCommunityPosts", () => {
  test("relatedVideoIdが存在する動画のIDなら関連動画を解決する", () => {
    const [resolved] = resolveCommunityPosts(
      [
        {
          id: "post1",
          text: "本文",
          date: "2026-01-01T00:00:00Z",
          relatedVideoId: "abc12345678",
        },
      ],
      videos,
    );
    expect(resolved?.relatedVideo?.id).toBe("abc12345678");
  });

  test("relatedVideoIdが削除済み等でvideosに存在しない場合はnullにする", () => {
    const [resolved] = resolveCommunityPosts(
      [{ id: "post1", text: "本文", date: "2026-01-01T00:00:00Z", relatedVideoId: "missing" }],
      videos,
    );
    expect(resolved?.relatedVideo).toBeNull();
  });

  test("relatedVideoId未設定ならnullにする", () => {
    const [resolved] = resolveCommunityPosts(
      [{ id: "post1", text: "本文", date: "2026-01-01T00:00:00Z" }],
      videos,
    );
    expect(resolved?.relatedVideo).toBeNull();
  });
});
