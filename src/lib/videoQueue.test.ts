import { describe, expect, test } from "bun:test";
import { createVisibleVideoQueue, nextVideoInQueue } from "./videoQueue";

const queue = [
  { id: "first", title: "最初", aspect: "video" },
  { id: "second", title: "次", aspect: "short" },
] as const;

describe("nextVideoInQueue", () => {
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
