import { describe, expect, test } from "bun:test";
import { computePostingCadence } from "./postingCadence";

/** 基準日時から `daysAgo` 日前の ISO 8601 文字列を返す */
function daysAgo(base: Date, daysAgoValue: number): string {
  return new Date(base.getTime() - daysAgoValue * 24 * 60 * 60 * 1000).toISOString();
}

describe("computePostingCadence", () => {
  // JST 12:00 を基準にして、暦日差の計算がタイムゾーンでずれないかを検証しやすくする
  const base = new Date("2026-09-16T03:00:00Z");

  test("動画データが無ければ null", () => {
    expect(computePostingCadence([], base)).toBeNull();
  });

  test("最新の長尺投稿からの経過日数を算出する", () => {
    const videos = [
      { publishedAt: daysAgo(base, 15), isShort: false },
      { publishedAt: daysAgo(base, 45), isShort: false },
    ];
    const result = computePostingCadence(videos, base);
    expect(result?.daysSinceLatestLong).toBe(15);
  });

  test("長尺が1本も無ければ daysSinceLatestLong は null", () => {
    const videos = [{ publishedAt: daysAgo(base, 1), isShort: true }];
    const result = computePostingCadence(videos, base);
    expect(result?.daysSinceLatestLong).toBeNull();
  });

  test("isShort が null(未判定)の動画は長尺として扱う(index.astro の regularVideos と同じ方針)", () => {
    const videos = [{ publishedAt: daysAgo(base, 3), isShort: null }];
    const result = computePostingCadence(videos, base);
    expect(result?.daysSinceLatestLong).toBe(3);
    expect(result?.recentLongCount).toBe(1);
  });

  test("直近30日の長尺・Shorts本数をそれぞれ集計する", () => {
    const videos = [
      { publishedAt: daysAgo(base, 5), isShort: false },
      { publishedAt: daysAgo(base, 10), isShort: false },
      { publishedAt: daysAgo(base, 20), isShort: true },
      { publishedAt: daysAgo(base, 29), isShort: true },
      { publishedAt: daysAgo(base, 40), isShort: true }, // 期間外
    ];
    const result = computePostingCadence(videos, base);
    expect(result?.recentLongCount).toBe(2);
    expect(result?.recentShortCount).toBe(2);
  });

  test("公開日時が不正な要素は無視する", () => {
    const videos = [
      { publishedAt: daysAgo(base, 5), isShort: false },
      { publishedAt: "not-a-date", isShort: false },
    ];
    const result = computePostingCadence(videos, base);
    expect(result?.daysSinceLatestLong).toBe(5);
    expect(result?.recentLongCount).toBe(1);
  });

  test("未来日時(現在時刻より後)の動画は直近本数に含めない", () => {
    const videos = [
      { publishedAt: daysAgo(base, 5), isShort: false },
      { publishedAt: daysAgo(base, -1), isShort: false },
    ];
    const result = computePostingCadence(videos, base);
    expect(result?.recentLongCount).toBe(1);
  });

  test("経過日数が STAGNATION_THRESHOLD_DAYS(14日)未満なら停滞扱いにしない", () => {
    const videos = [{ publishedAt: daysAgo(base, 13), isShort: false }];
    expect(computePostingCadence(videos, base)?.isStagnant).toBe(false);
  });

  test("経過日数が14日以上なら停滞扱いにする", () => {
    const videos = [{ publishedAt: daysAgo(base, 14), isShort: false }];
    expect(computePostingCadence(videos, base)?.isStagnant).toBe(true);
  });

  test("長尺が無ければ停滞扱いにしない(daysSinceLatestLong が null のため)", () => {
    const videos = [{ publishedAt: daysAgo(base, 100), isShort: true }];
    expect(computePostingCadence(videos, base)?.isStagnant).toBe(false);
  });

  test("JST の日付境界をまたいでも暦日差がずれない", () => {
    // JST 2026-09-16 12:00 が基準。ちょうど14日前の JST 2026-09-02 12:00 に公開。
    const jstBase = new Date("2026-09-16T03:00:00Z");
    const publishedAt = "2026-09-02T03:00:00Z";
    const result = computePostingCadence([{ publishedAt, isShort: false }], jstBase);
    expect(result?.daysSinceLatestLong).toBe(14);
  });
});
