import { describe, expect, test } from "bun:test";
import { computeUpdateFrequencyLabel } from "./updateFrequency";

/** 基準日時から `daysAgo` 日前の ISO 8601 文字列を返す */
function daysAgo(base: Date, daysAgoValue: number): string {
  return new Date(base.getTime() - daysAgoValue * 24 * 60 * 60 * 1000).toISOString();
}

function toVideos(base: Date, daysAgoList: readonly number[]): { publishedAt: string }[] {
  return daysAgoList.map((d) => ({ publishedAt: daysAgo(base, d) }));
}

describe("computeUpdateFrequencyLabel", () => {
  const base = new Date("2026-08-12T00:00:00Z");

  test("一定間隔(週1本ペース)なら単一値で返す", () => {
    const videos = toVideos(base, [0, 7, 14, 21, 28]);
    expect(computeUpdateFrequencyLabel(videos)).toBe("週1本更新");
  });

  test("間隔にばらつきがあっても許容範囲内なら幅で返す", () => {
    const videos = toVideos(base, [0, 2, 4, 6, 11, 16, 21]);
    expect(computeUpdateFrequencyLabel(videos)).toBe("週1〜4本更新");
  });

  test("月数本ペースなら「月」単位で返す", () => {
    const videos = toVideos(base, [0, 15, 30, 45, 60]);
    expect(computeUpdateFrequencyLabel(videos)).toBe("月2本更新");
  });

  test("動画数が少なすぎる(間隔が4未満)場合は null", () => {
    const videos = toVideos(base, [0, 7, 14, 21]);
    expect(computeUpdateFrequencyLabel(videos)).toBeNull();
  });

  test("間隔が不規則すぎる場合は null", () => {
    const videos = toVideos(base, [0, 1, 2, 3, 13, 23, 53]);
    expect(computeUpdateFrequencyLabel(videos)).toBeNull();
  });

  test("更新ペースが低すぎる(中央値が30日超)場合は null", () => {
    const videos = toVideos(base, [0, 45, 90, 135, 180]);
    expect(computeUpdateFrequencyLabel(videos)).toBeNull();
  });

  test("公開日時が不正な要素は無視する", () => {
    const videos = [...toVideos(base, [0, 7, 14, 21, 28]), { publishedAt: "not-a-date" }];
    expect(computeUpdateFrequencyLabel(videos)).toBe("週1本更新");
  });

  test("入力の並び順に依存しない", () => {
    const videos = toVideos(base, [21, 0, 28, 7, 14]);
    expect(computeUpdateFrequencyLabel(videos)).toBe("週1本更新");
  });

  test("同時刻公開が重複しても(間隔0を除外して)算出する", () => {
    const videos = toVideos(base, [0, 0, 7, 14, 21, 28]);
    expect(computeUpdateFrequencyLabel(videos)).toBe("週1本更新");
  });

  test("直近12本を超えるデータは無視する(古いデータに引きずられない)", () => {
    const recent = toVideos(base, [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77]);
    const stale = toVideos(base, [400, 401, 402]);
    expect(computeUpdateFrequencyLabel([...recent, ...stale])).toBe("週1本更新");
  });
});
