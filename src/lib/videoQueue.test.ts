import { describe, expect, test } from "bun:test";
import {
  createVideoQueue,
  createVisibleVideoQueue,
  nextVideoInQueue,
  parseVideoQueue,
} from "./videoQueue";

const videos = [
  { id: "first", title: "最初", isShort: false },
  { id: "second", title: "次", isShort: true },
] as const;

describe("createVideoQueue", () => {
  test("動画の順序とShortsのアスペクトをキューへ変換する", () => {
    expect(createVideoQueue(videos)).toEqual([
      { id: "first", title: "最初", aspect: "video" },
      { id: "second", title: "次", aspect: "short" },
    ]);
  });
});

describe("nextVideoInQueue", () => {
  const queue = createVideoQueue(videos);

  test("現在の動画の次を返す", () => {
    expect(nextVideoInQueue(queue, "first")?.id).toBe("second");
  });

  test("末尾・不明な動画ではループしない", () => {
    expect(nextVideoInQueue(queue, "second")).toBeNull();
    expect(nextVideoInQueue(queue, "missing")).toBeNull();
  });
});

describe("createVisibleVideoQueue", () => {
  test("DOM順を保ち、非表示カードをキューから除外する", () => {
    expect(
      createVisibleVideoQueue([
        { id: "first", title: "最初", aspect: "video", hidden: false },
        { id: "hidden", title: "非表示", aspect: "video", hidden: true },
        { id: "last", title: "最後", aspect: "short" },
      ]),
    ).toEqual([
      { id: "first", title: "最初", aspect: "video" },
      { id: "last", title: "最後", aspect: "short" },
    ]);
  });
});

describe("parseVideoQueue", () => {
  test("不正な項目を除外する", () => {
    const value = JSON.stringify([
      { id: "ok", title: "有効", aspect: "video" },
      { id: "../secret", title: "不正", aspect: "video" },
      { id: "no-title", title: "", aspect: "video" },
      { id: "short", title: "Short", aspect: "short" },
    ]);
    expect(parseVideoQueue(value)).toEqual([
      { id: "ok", title: "有効", aspect: "video" },
      { id: "short", title: "Short", aspect: "short" },
    ]);
  });

  test("空値・壊れたJSONは空キューにする", () => {
    expect(parseVideoQueue(undefined)).toEqual([]);
    expect(parseVideoQueue("not-json")).toEqual([]);
  });
});
