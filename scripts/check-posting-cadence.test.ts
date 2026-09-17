import { describe, expect, test } from "bun:test";
import { buildSummary } from "./check-posting-cadence";

describe("buildSummary", () => {
  test("cadence が null(動画データ無し)なら stagnant=false", () => {
    const result = buildSummary(null);
    expect(result.stagnant).toBe(false);
    expect(result.summary).toContain("動画データ");
  });

  test("isStagnant=true なら stagnant=true", () => {
    const result = buildSummary({
      daysSinceLatestLong: 20,
      recentLongCount: 0,
      recentShortCount: 1,
      isStagnant: true,
    });
    expect(result.stagnant).toBe(true);
    expect(result.summary).toContain("20日経過");
    expect(result.summary).toContain("長尺0本");
    expect(result.summary).toContain("Shorts1本");
  });

  test("isStagnant=false なら stagnant=false", () => {
    const result = buildSummary({
      daysSinceLatestLong: 3,
      recentLongCount: 2,
      recentShortCount: 4,
      isStagnant: false,
    });
    expect(result.stagnant).toBe(false);
  });

  test("長尺投稿が無い(daysSinceLatestLong=null)場合の文言", () => {
    const result = buildSummary({
      daysSinceLatestLong: null,
      recentLongCount: 0,
      recentShortCount: 2,
      isStagnant: false,
    });
    expect(result.summary).toContain("長尺投稿がまだありません");
  });
});
