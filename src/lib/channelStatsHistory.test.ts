import { describe, expect, test } from "bun:test";
import {
  appendChannelStatsHistory,
  buildSparklinePoints,
  createEmptyChannelStatsHistory,
  MAX_HISTORY_ENTRIES,
  parseChannelStatsHistory,
  sparklinePointsToPolyline,
  toJstDateString,
} from "./channelStatsHistory";

describe("createEmptyChannelStatsHistory", () => {
  test("空配列を返す", () => {
    expect(createEmptyChannelStatsHistory()).toEqual([]);
  });
});

describe("toJstDateString", () => {
  test("UTC の日時を日本時間の日付(YYYY-MM-DD)に変換する", () => {
    // UTC 21:25 は JST では翌日 06:25
    expect(toJstDateString("2026-08-21T21:25:43.089Z")).toBe("2026-08-22");
  });

  test("日付が変わらない時刻はそのまま", () => {
    expect(toJstDateString("2026-08-21T00:00:00.000Z")).toBe("2026-08-21");
  });

  test("不正な日時文字列は throw する", () => {
    expect(() => toJstDateString("not-a-date")).toThrow("不正な日時文字列");
  });
});

describe("parseChannelStatsHistory", () => {
  test("正常な配列をパースできる", () => {
    const data = [
      { date: "2026-08-01", subscriberCount: 100 },
      { date: "2026-08-02", subscriberCount: 105 },
    ];
    expect(parseChannelStatsHistory(data)).toEqual(data);
  });

  test("空配列を許可する(初回実行前)", () => {
    expect(parseChannelStatsHistory([])).toEqual([]);
  });

  test("配列でなければ throw する", () => {
    expect(() => parseChannelStatsHistory({})).toThrow("配列ではありません");
  });

  test("date が不正な形式なら throw する", () => {
    expect(() => parseChannelStatsHistory([{ date: "2026/08/01", subscriberCount: 1 }])).toThrow(
      "date は YYYY-MM-DD 形式",
    );
  });

  test("subscriberCount が数値でなければ throw する", () => {
    expect(() => parseChannelStatsHistory([{ date: "2026-08-01", subscriberCount: "1" }])).toThrow(
      "subscriberCount は数値",
    );
  });

  test("要素がオブジェクトでなければ throw する", () => {
    expect(() => parseChannelStatsHistory([null])).toThrow("オブジェクトではありません");
  });
});

describe("appendChannelStatsHistory", () => {
  test("空の履歴に追記できる", () => {
    const result = appendChannelStatsHistory([], { date: "2026-08-01", subscriberCount: 100 });
    expect(result).toEqual([{ date: "2026-08-01", subscriberCount: 100 }]);
  });

  test("日付昇順を維持して追記する", () => {
    const history = [
      { date: "2026-08-01", subscriberCount: 100 },
      { date: "2026-08-03", subscriberCount: 110 },
    ];
    const result = appendChannelStatsHistory(history, { date: "2026-08-02", subscriberCount: 105 });
    expect(result.map((h) => h.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  test("同日分は上書きする(1日複数回実行されても1件のみ)", () => {
    const history = [{ date: "2026-08-01", subscriberCount: 100 }];
    const result = appendChannelStatsHistory(history, { date: "2026-08-01", subscriberCount: 120 });
    expect(result).toEqual([{ date: "2026-08-01", subscriberCount: 120 }]);
  });

  test("maxEntries を超えた分は古い方から間引く", () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-08-0${i + 1}`,
      subscriberCount: 100 + i,
    }));
    const result = appendChannelStatsHistory(
      history,
      { date: "2026-08-06", subscriberCount: 200 },
      3,
    );
    expect(result.map((h) => h.date)).toEqual(["2026-08-04", "2026-08-05", "2026-08-06"]);
  });

  test("デフォルトの上限は MAX_HISTORY_ENTRIES(90件)", () => {
    const history = Array.from({ length: MAX_HISTORY_ENTRIES }, (_, i) => ({
      date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      subscriberCount: i,
    }));
    const result = appendChannelStatsHistory(history, { date: "2027-01-01", subscriberCount: 999 });
    expect(result).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(result.at(-1)).toEqual({ date: "2027-01-01", subscriberCount: 999 });
  });
});

describe("buildSparklinePoints", () => {
  test("履歴が1件以下なら null を返す(折れ線を描けない)", () => {
    expect(buildSparklinePoints([], 100, 20)).toBeNull();
    expect(
      buildSparklinePoints([{ date: "2026-08-01", subscriberCount: 100 }], 100, 20),
    ).toBeNull();
  });

  test("増加傾向なら右肩上がり(y が小さくなる)の座標列を返す", () => {
    const history = [
      { date: "2026-08-01", subscriberCount: 100 },
      { date: "2026-08-02", subscriberCount: 150 },
      { date: "2026-08-03", subscriberCount: 200 },
    ];
    const points = buildSparklinePoints(history, 100, 20, 0);
    expect(points).toHaveLength(3);
    // SVG は上が y=0 のため、値が増えるほど y は小さくなる
    expect(points?.[0]?.y).toBe(20);
    expect(points?.[1]?.y).toBe(10);
    expect(points?.[2]?.y).toBe(0);
    // x は等間隔で 0 から width まで
    expect(points?.[0]?.x).toBe(0);
    expect(points?.[2]?.x).toBe(100);
  });

  test("全期間で値が同じ場合は縦方向中央の水平線になる(ゼロ除算回避)", () => {
    const history = [
      { date: "2026-08-01", subscriberCount: 100 },
      { date: "2026-08-02", subscriberCount: 100 },
    ];
    const points = buildSparklinePoints(history, 100, 20, 0);
    expect(points?.every((p) => p.y === 10)).toBe(true);
  });

  test("padding を反映した座標範囲になる", () => {
    const history = [
      { date: "2026-08-01", subscriberCount: 100 },
      { date: "2026-08-02", subscriberCount: 200 },
    ];
    const points = buildSparklinePoints(history, 100, 20, 5);
    expect(points?.[0]?.x).toBe(5);
    expect(points?.[1]?.x).toBe(95);
    expect(points?.[0]?.y).toBe(15);
    expect(points?.[1]?.y).toBe(5);
  });
});

describe("sparklinePointsToPolyline", () => {
  test("points 属性値の文字列に変換する", () => {
    expect(
      sparklinePointsToPolyline([
        { x: 0, y: 10 },
        { x: 50, y: 0 },
        { x: 100, y: 20 },
      ]),
    ).toBe("0,10 50,0 100,20");
  });

  test("空配列は空文字を返す", () => {
    expect(sparklinePointsToPolyline([])).toBe("");
  });
});
