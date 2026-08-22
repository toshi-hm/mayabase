import { describe, expect, test } from "bun:test";
import { evaluateFreshness, STALE_THRESHOLD_HOURS } from "./check-fetch-freshness";

const NOW = new Date("2026-08-22T00:00:00.000Z");

describe("evaluateFreshness", () => {
  test("閾値(72時間)以内の取得は stale=false", () => {
    const fetchedAt = new Date(NOW.getTime() - 1 * 60 * 60 * 1000).toISOString(); // 1時間前
    const result = evaluateFreshness(fetchedAt, NOW);
    expect(result.stale).toBe(false);
    expect(result.hoursSinceFetch).toBe(1);
    expect(result.fetchedAt).toBe(fetchedAt);
  });

  test("閾値ちょうど(72時間)は stale=false(境界値、超過のみ stale)", () => {
    const fetchedAt = new Date(
      NOW.getTime() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const result = evaluateFreshness(fetchedAt, NOW);
    expect(result.stale).toBe(false);
  });

  test("閾値(72時間)を超えた取得は stale=true", () => {
    const fetchedAt = new Date(NOW.getTime() - 73 * 60 * 60 * 1000).toISOString(); // 73時間前
    const result = evaluateFreshness(fetchedAt, NOW);
    expect(result.stale).toBe(true);
    expect(result.hoursSinceFetch).toBe(73);
  });

  test("大幅に古い取得(数週間)は stale=true", () => {
    const fetchedAt = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14日前
    const result = evaluateFreshness(fetchedAt, NOW);
    expect(result.stale).toBe(true);
    expect(result.hoursSinceFetch).toBe(336);
  });

  test("fetchedAt が null(一度も取得成功していない)場合は stale=true", () => {
    const result = evaluateFreshness(null, NOW);
    expect(result.stale).toBe(true);
    expect(result.hoursSinceFetch).toBeNull();
  });

  test("fetchedAt が不正な日時文字列の場合も stale=true", () => {
    const result = evaluateFreshness("not-a-date", NOW);
    expect(result.stale).toBe(true);
    expect(result.hoursSinceFetch).toBeNull();
  });

  test("カスタム閾値を指定できる(例: 24時間)", () => {
    const fetchedAt = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(); // 25時間前
    const result = evaluateFreshness(fetchedAt, NOW, 24);
    expect(result.stale).toBe(true);
  });

  test("summary は日本語で理由を説明する", () => {
    const stale = evaluateFreshness(null, NOW);
    expect(stale.summary).toContain("fetchedAt");

    const fresh = evaluateFreshness(NOW.toISOString(), NOW);
    expect(fresh.summary).toContain("閾値");
  });
});
