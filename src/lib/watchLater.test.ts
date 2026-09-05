import { describe, expect, test } from "bun:test";
import {
  buildWatchLaterPlaylistUrl,
  addWatchLaterId,
  isWatchLaterSaved,
  parseStoredWatchLaterIds,
  removeWatchLaterId,
  toggleWatchLaterId,
  WATCH_LATER_MAX_ITEMS,
} from "./watchLater";

describe("buildWatchLaterPlaylistUrl", () => {
  test("動画IDを保存順に一時プレイリストURLへ変換する", () => {
    expect(buildWatchLaterPlaylistUrl(["abc123", "def456"])).toBe(
      "https://www.youtube.com/watch_videos?video_ids=abc123,def456",
    );
  });

  test("動画IDに含まれる文字をURLエンコードする", () => {
    expect(buildWatchLaterPlaylistUrl(["a/b", "c d"])).toBe(
      "https://www.youtube.com/watch_videos?video_ids=a%2Fb,c%20d",
    );
  });
});

describe("parseStoredWatchLaterIds", () => {
  test("未設定(null)は空配列", () => {
    expect(parseStoredWatchLaterIds(null)).toEqual([]);
  });

  test("妥当なJSON配列はそのまま返す", () => {
    expect(parseStoredWatchLaterIds('["abc123","def456"]')).toEqual(["abc123", "def456"]);
  });

  test("JSONとして解釈できない値は空配列にフォールバックする", () => {
    expect(parseStoredWatchLaterIds("not json")).toEqual([]);
    expect(parseStoredWatchLaterIds("")).toEqual([]);
  });

  test("配列でない値・要素が文字列でない値・空文字列を含む値は空配列にフォールバックする", () => {
    expect(parseStoredWatchLaterIds('{"a":1}')).toEqual([]);
    expect(parseStoredWatchLaterIds("123")).toEqual([]);
    expect(parseStoredWatchLaterIds('["abc",1]')).toEqual([]);
    expect(parseStoredWatchLaterIds('["abc",""]')).toEqual([]);
  });
});

describe("isWatchLaterSaved", () => {
  test("配列に含まれていれば true", () => {
    expect(isWatchLaterSaved(["abc", "def"], "abc")).toBe(true);
  });

  test("配列に含まれていなければ false", () => {
    expect(isWatchLaterSaved(["abc", "def"], "xyz")).toBe(false);
    expect(isWatchLaterSaved([], "xyz")).toBe(false);
  });
});

describe("addWatchLaterId", () => {
  test("未保存のIDを末尾に追加する", () => {
    expect(addWatchLaterId(["abc"], "def")).toEqual(["abc", "def"]);
  });

  test("既に保存済みのIDは重複追加しない", () => {
    expect(addWatchLaterId(["abc", "def"], "abc")).toEqual(["abc", "def"]);
  });

  test("上限(WATCH_LATER_MAX_ITEMS)に達している場合は追加しない", () => {
    const full = Array.from({ length: WATCH_LATER_MAX_ITEMS }, (_, i) => `id${i}`);
    expect(addWatchLaterId(full, "new-id")).toEqual(full);
    expect(addWatchLaterId(full, "new-id")).not.toBe(full);
  });

  test("元の配列を変更しない", () => {
    const original = ["abc"];
    addWatchLaterId(original, "def");
    expect(original).toEqual(["abc"]);
  });
});

describe("removeWatchLaterId", () => {
  test("指定したIDを取り除く", () => {
    expect(removeWatchLaterId(["abc", "def"], "abc")).toEqual(["def"]);
  });

  test("存在しないIDを指定しても変化しない(内容は等しいコピーを返す)", () => {
    expect(removeWatchLaterId(["abc", "def"], "xyz")).toEqual(["abc", "def"]);
  });

  test("元の配列を変更しない", () => {
    const original = ["abc", "def"];
    removeWatchLaterId(original, "abc");
    expect(original).toEqual(["abc", "def"]);
  });
});

describe("toggleWatchLaterId", () => {
  test("未保存のIDはトグルで追加される", () => {
    expect(toggleWatchLaterId(["abc"], "def")).toEqual(["abc", "def"]);
  });

  test("保存済みのIDはトグルで削除される", () => {
    expect(toggleWatchLaterId(["abc", "def"], "abc")).toEqual(["def"]);
  });
});

