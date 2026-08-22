import { describe, expect, test } from "bun:test";
import {
  CONTINUE_WATCHING_MAX_ITEMS,
  parseContinueWatchingCandidates,
  parseStoredContinueWatchingIds,
  recordContinueWatchingId,
  selectContinueWatchingVideo,
} from "./continueWatching";

describe("parseStoredContinueWatchingIds", () => {
  test("未設定(null)は空配列", () => {
    expect(parseStoredContinueWatchingIds(null)).toEqual([]);
  });

  test("妥当なJSON配列はそのまま返す", () => {
    expect(parseStoredContinueWatchingIds('["abc123","def456"]')).toEqual(["abc123", "def456"]);
  });

  test("JSONとして解釈できない値は空配列にフォールバックする", () => {
    expect(parseStoredContinueWatchingIds("not json")).toEqual([]);
    expect(parseStoredContinueWatchingIds("")).toEqual([]);
  });

  test("配列でない値・要素が文字列でない値・空文字列を含む値は空配列にフォールバックする", () => {
    expect(parseStoredContinueWatchingIds('{"a":1}')).toEqual([]);
    expect(parseStoredContinueWatchingIds("123")).toEqual([]);
    expect(parseStoredContinueWatchingIds('["abc",1]')).toEqual([]);
    expect(parseStoredContinueWatchingIds('["abc",""]')).toEqual([]);
  });
});

describe("recordContinueWatchingId", () => {
  test("新しいIDを先頭に追加する", () => {
    expect(recordContinueWatchingId(["abc"], "def")).toEqual(["def", "abc"]);
  });

  test("空配列にも記録できる", () => {
    expect(recordContinueWatchingId([], "abc")).toEqual(["abc"]);
  });

  test("既に記録済みのIDは重複させず先頭へ移動する", () => {
    expect(recordContinueWatchingId(["abc", "def", "ghi"], "def")).toEqual(["def", "abc", "ghi"]);
  });

  test("同じIDを連続で記録しても増えない", () => {
    expect(recordContinueWatchingId(["abc"], "abc")).toEqual(["abc"]);
  });

  test(`上限(${CONTINUE_WATCHING_MAX_ITEMS}件)を超えた古い分は切り捨てる`, () => {
    const full = Array.from({ length: CONTINUE_WATCHING_MAX_ITEMS }, (_, i) => `id${i}`);
    const result = recordContinueWatchingId(full, "new-id");
    expect(result).toHaveLength(CONTINUE_WATCHING_MAX_ITEMS);
    expect(result[0]).toBe("new-id");
    expect(result).not.toContain(`id${CONTINUE_WATCHING_MAX_ITEMS - 1}`);
  });

  test("元の配列を変更しない", () => {
    const original = ["abc"];
    recordContinueWatchingId(original, "def");
    expect(original).toEqual(["abc"]);
  });
});

describe("parseContinueWatchingCandidates", () => {
  test("未設定(null)は空配列", () => {
    expect(parseContinueWatchingCandidates(null)).toEqual([]);
  });

  test("妥当なJSON配列はそのまま返す", () => {
    const json =
      '[{"id":"abc","title":"タイトル","isShort":false},{"id":"def","title":"短編","isShort":true}]';
    expect(parseContinueWatchingCandidates(json)).toEqual([
      { id: "abc", title: "タイトル", isShort: false },
      { id: "def", title: "短編", isShort: true },
    ]);
  });

  test("isShort が null の要素も許容する", () => {
    const json = '[{"id":"abc","title":"タイトル","isShort":null}]';
    expect(parseContinueWatchingCandidates(json)).toEqual([
      { id: "abc", title: "タイトル", isShort: null },
    ]);
  });

  test("JSONとして解釈できない値は空配列にフォールバックする", () => {
    expect(parseContinueWatchingCandidates("not json")).toEqual([]);
    expect(parseContinueWatchingCandidates("")).toEqual([]);
  });

  test("配列でない値・要素の形式が不正な値は空配列にフォールバックする", () => {
    expect(parseContinueWatchingCandidates('{"id":"abc"}')).toEqual([]);
    expect(parseContinueWatchingCandidates('[{"id":"abc"}]')).toEqual([]);
    expect(parseContinueWatchingCandidates('[{"id":"","title":"t","isShort":null}]')).toEqual([]);
    expect(parseContinueWatchingCandidates('[{"id":"abc","title":"t","isShort":"no"}]')).toEqual(
      [],
    );
  });
});

describe("selectContinueWatchingVideo", () => {
  const candidates = [
    { id: "abc", title: "A" },
    { id: "def", title: "B" },
  ];

  test("記録済み一覧の先頭が候補に存在すればそれを選ぶ", () => {
    expect(selectContinueWatchingVideo(["abc", "def"], candidates)).toEqual({
      id: "abc",
      title: "A",
    });
  });

  test("先頭が候補に存在しない(削除・非公開等)場合は次の候補を選ぶ", () => {
    expect(selectContinueWatchingVideo(["zzz", "def"], candidates)).toEqual({
      id: "def",
      title: "B",
    });
  });

  test("いずれも候補に存在しなければ null", () => {
    expect(selectContinueWatchingVideo(["zzz", "yyy"], candidates)).toBeNull();
  });

  test("記録が空なら null", () => {
    expect(selectContinueWatchingVideo([], candidates)).toBeNull();
  });
});
