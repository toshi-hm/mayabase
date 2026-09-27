import { describe, expect, test } from "bun:test";
import {
  buildPlaylistVideoIdIndex,
  createEmptyPlaylistsData,
  parsePlaylistsData,
} from "./playlists";

describe("createEmptyPlaylistsData", () => {
  test("空のデータを返す", () => {
    expect(createEmptyPlaylistsData()).toEqual({ fetchedAt: null, playlists: [] });
  });
});

describe("parsePlaylistsData", () => {
  test("正常なデータをパースできる", () => {
    const data = parsePlaylistsData({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      playlists: [{ id: "PLabc", videoIds: ["v1", "v2"] }],
    });
    expect(data.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(data.playlists).toEqual([{ id: "PLabc", videoIds: ["v1", "v2"] }]);
  });

  test("fetchedAt が null でもパースできる", () => {
    expect(parsePlaylistsData({ fetchedAt: null, playlists: [] }).fetchedAt).toBeNull();
  });

  test("オブジェクトでなければ throw する", () => {
    expect(() => parsePlaylistsData(null)).toThrow("オブジェクトではありません");
  });

  test("fetchedAt が不正な型なら throw する", () => {
    expect(() => parsePlaylistsData({ fetchedAt: 123, playlists: [] })).toThrow("fetchedAt");
  });

  test("playlists が配列でなければ throw する", () => {
    expect(() => parsePlaylistsData({ fetchedAt: null, playlists: {} })).toThrow(
      "playlists は配列",
    );
  });

  test("id が不正なら throw する", () => {
    expect(() =>
      parsePlaylistsData({ fetchedAt: null, playlists: [{ id: "", videoIds: [] }] }),
    ).toThrow("id が不正");
  });

  test("id が重複していれば throw する", () => {
    expect(() =>
      parsePlaylistsData({
        fetchedAt: null,
        playlists: [
          { id: "PLabc", videoIds: [] },
          { id: "PLabc", videoIds: [] },
        ],
      }),
    ).toThrow("重複");
  });

  test("videoIds が文字列配列でなければ throw する", () => {
    expect(() =>
      parsePlaylistsData({ fetchedAt: null, playlists: [{ id: "PLabc", videoIds: [1, 2] }] }),
    ).toThrow("videoIds");
    expect(() =>
      parsePlaylistsData({ fetchedAt: null, playlists: [{ id: "PLabc", videoIds: "v1" }] }),
    ).toThrow("videoIds");
  });
});

describe("buildPlaylistVideoIdIndex", () => {
  test("再生リストID → 動画ID集合のマップに変換する", () => {
    const index = buildPlaylistVideoIdIndex({
      fetchedAt: null,
      playlists: [
        { id: "PLabc", videoIds: ["v1", "v2"] },
        { id: "PLdef", videoIds: [] },
      ],
    });
    expect(index.get("PLabc")).toEqual(new Set(["v1", "v2"]));
    expect(index.get("PLdef")).toEqual(new Set());
    expect(index.get("PLunknown")).toBeUndefined();
  });

  test("空データでは空のマップを返す", () => {
    expect(buildPlaylistVideoIdIndex(createEmptyPlaylistsData()).size).toBe(0);
  });
});
