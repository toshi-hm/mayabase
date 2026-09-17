import { describe, expect, test } from "bun:test";
import { isWatchedId, parseStoredWatchedIds, recordWatchedId, WATCHED_MAX_ITEMS } from "./watched";

describe("parseStoredWatchedIds", () => {
  test("未設定(null)は空配列", () => {
    expect(parseStoredWatchedIds(null)).toEqual([]);
  });

  test("妥当なJSON配列はそのまま返す", () => {
    expect(parseStoredWatchedIds('["abc123","def456"]')).toEqual(["abc123", "def456"]);
  });

  test("JSONとして解釈できない値は空配列にフォールバックする", () => {
    expect(parseStoredWatchedIds("not json")).toEqual([]);
    expect(parseStoredWatchedIds("")).toEqual([]);
  });

  test("配列でない値・要素が文字列でない値・空文字列を含む値は空配列にフォールバックする", () => {
    expect(parseStoredWatchedIds('{"a":1}')).toEqual([]);
    expect(parseStoredWatchedIds("123")).toEqual([]);
    expect(parseStoredWatchedIds('["abc",1]')).toEqual([]);
    expect(parseStoredWatchedIds('["abc",""]')).toEqual([]);
  });
});

describe("isWatchedId", () => {
  test("配列に含まれていれば true", () => {
    expect(isWatchedId(["abc", "def"], "abc")).toBe(true);
  });

  test("配列に含まれていなければ false", () => {
    expect(isWatchedId(["abc", "def"], "xyz")).toBe(false);
    expect(isWatchedId([], "xyz")).toBe(false);
  });
});

describe("recordWatchedId", () => {
  test("新しいIDを末尾に追加する", () => {
    expect(recordWatchedId(["abc"], "def")).toEqual(["abc", "def"]);
  });

  test("空配列にも記録できる", () => {
    expect(recordWatchedId([], "abc")).toEqual(["abc"]);
  });

  test("既に記録済みのIDは重複させない", () => {
    expect(recordWatchedId(["abc", "def"], "abc")).toEqual(["abc", "def"]);
  });

  test(`上限(${WATCHED_MAX_ITEMS}件)を超えた古い分は間引く`, () => {
    const full = Array.from({ length: WATCHED_MAX_ITEMS }, (_, i) => `id${i}`);
    const result = recordWatchedId(full, "new-id");
    expect(result).toHaveLength(WATCHED_MAX_ITEMS);
    expect(result[result.length - 1]).toBe("new-id");
    expect(result).not.toContain("id0");
    expect(result).toContain("id1");
  });

  test("元の配列を変更しない", () => {
    const original = ["abc"];
    recordWatchedId(original, "def");
    expect(original).toEqual(["abc"]);
  });
});
