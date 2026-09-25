import { describe, expect, test } from "bun:test";
import {
  appendVideoViewHistory,
  calculateRecentViewGrowth,
  MAX_VIDEO_VIEW_HISTORY_SNAPSHOTS,
  parseVideoViewHistory,
} from "./videoViewHistory";
import type { Video } from "./youtube";

const video = (id: string, viewCount: number | null): Video => ({
  id,
  title: `title-${id}`,
  description: "",
  publishedAt: "2026-01-01T00:00:00Z",
  isShort: false,
  viewCount,
  duration: null,
});

describe("parseVideoViewHistory", () => {
  test("スナップショットを日付順に正規化する", () => {
    const parsed = parseVideoViewHistory({
      snapshots: [
        { date: "2026-09-10", viewCounts: { a: 10 } },
        { date: "2026-09-01", viewCounts: { a: 1 } },
      ],
    });
    expect(parsed.snapshots.map((snapshot) => snapshot.date)).toEqual(["2026-09-01", "2026-09-10"]);
  });

  test("重複日付・負数・小数を拒否する", () => {
    expect(() =>
      parseVideoViewHistory({
        snapshots: [
          { date: "2026-09-01", viewCounts: { a: 1 } },
          { date: "2026-09-01", viewCounts: { b: 2 } },
        ],
      }),
    ).toThrow("重複");
    expect(() =>
      parseVideoViewHistory({ snapshots: [{ date: "2026-09-01", viewCounts: { a: -1 } }] }),
    ).toThrow("安全な整数");
    expect(() =>
      parseVideoViewHistory({ snapshots: [{ date: "2026-09-01", viewCounts: { a: 1.5 } }] }),
    ).toThrow("安全な整数");
  });
});

describe("appendVideoViewHistory", () => {
  test("同日を置き換え、90件を超える履歴を古い順に削る", () => {
    const history = parseVideoViewHistory({
      snapshots: Array.from({ length: MAX_VIDEO_VIEW_HISTORY_SNAPSHOTS }, (_, index) => ({
        date: `2026-01-${String(index + 1).padStart(2, "0")}`,
        viewCounts: { a: index },
      })),
    });
    const updated = appendVideoViewHistory(history, "2026-02-01", new Map([["a", 999]]));
    expect(updated.snapshots).toHaveLength(MAX_VIDEO_VIEW_HISTORY_SNAPSHOTS);
    expect(updated.snapshots.at(-1)?.viewCounts.a).toBe(999);
    expect(updated.snapshots[0]?.date).toBe("2026-01-02");
  });

  test("同日の部分取得でも既存動画の再生数を保持する", () => {
    const history = parseVideoViewHistory({
      snapshots: [{ date: "2026-09-25", viewCounts: { a: 10, b: 20 } }],
    });
    const updated = appendVideoViewHistory(history, "2026-09-25", new Map([["a", 15]]));
    expect(updated.snapshots).toEqual([
      { date: "2026-09-25", viewCounts: { a: 15, b: 20 } },
    ]);
  });
});

describe("calculateRecentViewGrowth", () => {
  test("基準日以前の最新値との差分を大きい順に返す", () => {
    const result = calculateRecentViewGrowth(
      [video("a", 150), video("b", 110), video("c", 90)],
      parseVideoViewHistory({
        snapshots: [
          { date: "2026-09-17", viewCounts: { a: 100, b: 120, c: 80 } },
          { date: "2026-09-24", viewCounts: { a: 140, b: 100, c: 90 } },
        ],
      }),
      "2026-09-25",
    );
    expect(result.map((item) => [item.video.id, item.increase, item.baselineDate])).toEqual([
      ["a", 50, "2026-09-17"],
      ["c", 10, "2026-09-17"],
    ]);
  });

  test("7日前の比較値がない新規動画は除外し、減少は負数で表示しない", () => {
    const result = calculateRecentViewGrowth(
      [video("new", 10), video("down", 90)],
      parseVideoViewHistory({
        snapshots: [{ date: "2026-09-17", viewCounts: { down: 100 } }],
      }),
      "2026-09-25",
    );
    expect(result).toEqual([]);
  });
});
