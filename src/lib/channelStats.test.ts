import { describe, expect, test } from "bun:test";
import {
  createEmptyChannelStats,
  formatFetchedAt,
  formatSubscriberCount,
  parseChannelStats,
  parseChannelStatsApiResponse,
} from "./channelStats";

describe("createEmptyChannelStats", () => {
  test("subscriberCount / fetchedAt ともに null", () => {
    expect(createEmptyChannelStats()).toEqual({ subscriberCount: null, fetchedAt: null });
  });
});

describe("parseChannelStats", () => {
  test("正常なデータをパースできる", () => {
    const data = parseChannelStats({ subscriberCount: 12345, fetchedAt: "2026-07-28T00:00:00Z" });
    expect(data).toEqual({ subscriberCount: 12345, fetchedAt: "2026-07-28T00:00:00Z" });
  });

  test("null 値を許可する(未取得状態)", () => {
    expect(parseChannelStats({ subscriberCount: null, fetchedAt: null })).toEqual({
      subscriberCount: null,
      fetchedAt: null,
    });
  });

  test("オブジェクトでなければ throw する", () => {
    expect(() => parseChannelStats(null)).toThrow("オブジェクトではありません");
  });

  test("型が不正なら throw する", () => {
    expect(() => parseChannelStats({ subscriberCount: "1000", fetchedAt: null })).toThrow(
      "subscriberCount",
    );
    expect(() => parseChannelStats({ subscriberCount: null, fetchedAt: 123 })).toThrow("fetchedAt");
  });
});

describe("parseChannelStatsApiResponse", () => {
  test("statistics.subscriberCount(文字列)を数値に変換する", () => {
    const response = { items: [{ statistics: { subscriberCount: "4321" } }] };
    expect(parseChannelStatsApiResponse(response)).toBe(4321);
  });

  test("hiddenSubscriberCount が true なら null", () => {
    const response = {
      items: [{ statistics: { subscriberCount: "100", hiddenSubscriberCount: true } }],
    };
    expect(parseChannelStatsApiResponse(response)).toBeNull();
  });

  test("items が空配列なら null", () => {
    expect(parseChannelStatsApiResponse({ items: [] })).toBeNull();
  });

  test("想定外の形式は例外を投げず null を返す", () => {
    expect(parseChannelStatsApiResponse(null)).toBeNull();
    expect(parseChannelStatsApiResponse({})).toBeNull();
    expect(parseChannelStatsApiResponse({ items: [{ statistics: {} }] })).toBeNull();
    expect(
      parseChannelStatsApiResponse({ items: [{ statistics: { subscriberCount: "abc" } }] }),
    ).toBeNull();
  });
});

describe("formatSubscriberCount", () => {
  test("1万未満は3桁区切りの人数", () => {
    expect(formatSubscriberCount(900)).toBe("900人");
    expect(formatSubscriberCount(9999)).toBe("9,999人");
  });

  test("1万以上は「万人」表記(小数第1位、.0 は省略)", () => {
    expect(formatSubscriberCount(10_000)).toBe("1万人");
    expect(formatSubscriberCount(12_345)).toBe("1.2万人");
    expect(formatSubscriberCount(150_000)).toBe("15万人");
  });
});

describe("formatFetchedAt", () => {
  test("JST の「M/D H:mm時点」形式に整形する", () => {
    expect(formatFetchedAt("2026-08-01T09:00:00Z")).toBe("8/1 18:00時点");
  });

  test("日付が変わる境界も JST 換算される", () => {
    expect(formatFetchedAt("2026-08-01T15:00:00Z")).toBe("8/2 00:00時点");
  });

  test("不正な日時文字列は例外を投げず空文字を返す(#80)", () => {
    expect(formatFetchedAt("not-a-date")).toBe("");
    expect(formatFetchedAt("")).toBe("");
  });
});
