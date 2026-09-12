import { describe, expect, test } from "bun:test";
import { addReactedVideoId, parseReactedVideoIds } from "./interest";

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
});
