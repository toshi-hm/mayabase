import { describe, expect, test } from "bun:test";
import {
  addReactedVideoId,
  formatInterestCount,
  INTEREST_REACTED_MAX_ITEMS,
  parseReactedVideoIds,
} from "./interest";

describe("parseReactedVideoIds", () => {
  test("正常な動画ID配列を読む", () => {
    expect(parseReactedVideoIds('["abc","def"]')).toEqual(["abc", "def"]);
  });

  test("不正な保存値は空配列にする", () => {
    expect(parseReactedVideoIds("not-json")).toEqual([]);
    expect(parseReactedVideoIds('["abc",1]')).toEqual([]);
  });
});

describe("addReactedVideoId", () => {
  test("同じ動画IDを重複保存しない", () => {
    expect(addReactedVideoId(["abc"], "abc")).toEqual(["abc"]);
    expect(addReactedVideoId(["abc"], "def")).toEqual(["abc", "def"]);
  });

  test("上限(INTEREST_REACTED_MAX_ITEMS)を超えた分は古い方から間引く(#434)", () => {
    const videoIds = Array.from({ length: INTEREST_REACTED_MAX_ITEMS }, (_, i) => `id-${i}`);
    const result = addReactedVideoId(videoIds, "new-id");
    expect(result).toHaveLength(INTEREST_REACTED_MAX_ITEMS);
    expect(result[0]).toBe("id-1");
    expect(result.at(-1)).toBe("new-id");
  });
});

describe("formatInterestCount (#574)", () => {
  test("0件のときは件数を非表示にする", () => {
    expect(formatInterestCount(0)).toEqual({ text: "", hidden: true });
  });

  test("1件以上は件数を表示する", () => {
    expect(formatInterestCount(1)).toEqual({ text: "1", hidden: false });
    expect(formatInterestCount(12)).toEqual({ text: "12", hidden: false });
  });

  test("zeroText 指定時は0件でも代替表示を出す(Shortsの円形バッジ用)", () => {
    expect(formatInterestCount(0, "+")).toEqual({ text: "+", hidden: false });
    expect(formatInterestCount(3, "+")).toEqual({ text: "3", hidden: false });
  });
});
