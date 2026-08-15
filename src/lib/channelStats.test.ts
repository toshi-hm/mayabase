import { describe, expect, test } from "bun:test";
import {
  createEmptyChannelStats,
  formatFetchedAt,
  formatSubscriberCount,
  nextSubscriberMilestone,
  parseChannelStats,
  parseChannelStatsApiResponse,
} from "./channelStats";

describe("createEmptyChannelStats", () => {
  test("subscriberCount / viewCount / fetchedAt ともに null", () => {
    expect(createEmptyChannelStats()).toEqual({
      subscriberCount: null,
      viewCount: null,
      fetchedAt: null,
    });
  });
});

describe("parseChannelStats", () => {
  test("正常なデータをパースできる", () => {
    const data = parseChannelStats({
      subscriberCount: 12345,
      viewCount: 987654,
      fetchedAt: "2026-07-28T00:00:00Z",
    });
    expect(data).toEqual({
      subscriberCount: 12345,
      viewCount: 987654,
      fetchedAt: "2026-07-28T00:00:00Z",
    });
  });

  test("null 値を許可する(未取得状態)", () => {
    expect(parseChannelStats({ subscriberCount: null, viewCount: null, fetchedAt: null })).toEqual({
      subscriberCount: null,
      viewCount: null,
      fetchedAt: null,
    });
  });

  test("viewCount 未設定の旧形式データも許容する(#60 で追加したフィールド)", () => {
    expect(
      parseChannelStats({ subscriberCount: 12345, fetchedAt: "2026-07-28T00:00:00Z" }),
    ).toEqual({
      subscriberCount: 12345,
      viewCount: null,
      fetchedAt: "2026-07-28T00:00:00Z",
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
    expect(() =>
      parseChannelStats({ subscriberCount: null, viewCount: "1000", fetchedAt: null }),
    ).toThrow("viewCount");
  });
});

describe("parseChannelStatsApiResponse", () => {
  test("statistics.subscriberCount / viewCount(文字列)を数値に変換する", () => {
    const response = {
      items: [{ statistics: { subscriberCount: "4321", viewCount: "987654" } }],
    };
    expect(parseChannelStatsApiResponse(response)).toEqual({
      subscriberCount: 4321,
      viewCount: 987654,
    });
  });

  test("hiddenSubscriberCount が true なら subscriberCount のみ null(viewCount は非公開設定の対象外)", () => {
    const response = {
      items: [
        { statistics: { subscriberCount: "100", viewCount: "500", hiddenSubscriberCount: true } },
      ],
    };
    expect(parseChannelStatsApiResponse(response)).toEqual({
      subscriberCount: null,
      viewCount: 500,
    });
  });

  test("items が空配列なら両方 null", () => {
    expect(parseChannelStatsApiResponse({ items: [] })).toEqual({
      subscriberCount: null,
      viewCount: null,
    });
  });

  test("想定外の形式は例外を投げず両方 null を返す", () => {
    expect(parseChannelStatsApiResponse(null)).toEqual({ subscriberCount: null, viewCount: null });
    expect(parseChannelStatsApiResponse({})).toEqual({ subscriberCount: null, viewCount: null });
    expect(parseChannelStatsApiResponse({ items: [{ statistics: {} }] })).toEqual({
      subscriberCount: null,
      viewCount: null,
    });
    expect(
      parseChannelStatsApiResponse({
        items: [{ statistics: { subscriberCount: "abc", viewCount: "xyz" } }],
      }),
    ).toEqual({ subscriberCount: null, viewCount: null });
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

describe("nextSubscriberMilestone", () => {
  test("1,000未満は次の100の倍数を返す", () => {
    expect(nextSubscriberMilestone(284)).toBe(300);
    expect(nextSubscriberMilestone(0)).toBe(100);
    expect(nextSubscriberMilestone(999)).toBe(1000);
  });

  test("1,000〜10,000未満は次の1,000の倍数を返す", () => {
    expect(nextSubscriberMilestone(1000)).toBe(2000);
    expect(nextSubscriberMilestone(1500)).toBe(2000);
    expect(nextSubscriberMilestone(9999)).toBe(10_000);
  });

  test("10,000〜100,000未満は次の10,000の倍数を返す", () => {
    expect(nextSubscriberMilestone(10_000)).toBe(20_000);
    expect(nextSubscriberMilestone(12_345)).toBe(20_000);
  });

  test("丁度キリの良い数値でも必ず現在の登録者数より大きい値を返す", () => {
    expect(nextSubscriberMilestone(100)).toBe(200);
    expect(nextSubscriberMilestone(1000)).toBe(2000);
    expect(nextSubscriberMilestone(10_000)).toBe(20_000);
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
