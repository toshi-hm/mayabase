import { describe, expect, test } from "bun:test";
import {
  buildChannelStatsView,
  createEmptyChannelStats,
  formatFetchedAt,
  formatSubscriberCount,
  formatVideoCount,
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
  const now = new Date("2026-08-15T00:00:00Z");

  test("now と同じ年なら「M/D H:mm時点」形式(年なし)に整形する", () => {
    expect(formatFetchedAt("2026-08-01T09:00:00Z", now)).toBe("8/1 18:00時点");
  });

  test("日付が変わる境界も JST 換算される", () => {
    expect(formatFetchedAt("2026-08-01T15:00:00Z", now)).toBe("8/2 00:00時点");
  });

  test("不正な日時文字列は例外を投げず空文字を返す(#80)", () => {
    expect(formatFetchedAt("not-a-date", now)).toBe("");
    expect(formatFetchedAt("", now)).toBe("");
  });

  test("now と異なる年の場合は「YYYY/M/D H:mm時点」形式で年も併記する(#364)", () => {
    expect(formatFetchedAt("2025-08-01T09:00:00Z", now)).toBe("2025/8/1 18:00時点");
  });

  test("年の同一判定はUTCではなくJST換算後の年で行う", () => {
    // now: UTC上は2026年だが、JST換算では2026-01-01 09:30(2026年)
    const nowNewYear = new Date("2026-01-01T00:30:00Z");
    // fetchedAt: UTC上は2025年だが、JST換算では2026-01-01 05:00(nowと同じ2026年)
    expect(formatFetchedAt("2025-12-31T20:00:00Z", nowNewYear)).toBe("1/1 05:00時点");
  });
});

describe("formatVideoCount", () => {
  test("常に3桁区切りの「○本」表記にする(万表記にはしない・#438)", () => {
    expect(formatVideoCount(0)).toBe("0本");
    expect(formatVideoCount(94)).toBe("94本");
    expect(formatVideoCount(1234)).toBe("1,234本");
    // 動画本数は実運用上ここまで大きくならないが、万表記に切り替わらないことを確認する
    expect(formatVideoCount(12_345)).toBe("12,345本");
  });
});

describe("buildChannelStatsView", () => {
  const now = new Date("2026-08-15T00:00:00Z");

  test("正常取得: 登録者数・総再生回数・動画本数・最終更新時刻・次の目標がすべて揃う", () => {
    const view = buildChannelStatsView(
      { subscriberCount: 284, viewCount: 147_000, fetchedAt: "2026-08-01T09:00:00Z" },
      94,
      now,
    );
    expect(view).toEqual({
      subscriberCount: 284,
      subscriberText: "284人",
      viewCount: 147_000,
      totalViewCountText: "14.7万回",
      videoCount: 94,
      videoCountText: "94本",
      nextMilestoneText: "300人",
      milestoneRemainingText: "16人",
      fetchedAt: "2026-08-01T09:00:00Z",
      fetchedAtText: "8/1 18:00時点",
      updateFailedText: null,
    });
  });

  test("次の目標(nextMilestoneText/milestoneRemainingText)は表示用の subscriberText と同じ subscriberCount から算出される(#438: 矛盾防止)", () => {
    const view = buildChannelStatsView(
      { subscriberCount: 999, viewCount: null, fetchedAt: "2026-08-01T09:00:00Z" },
      10,
      now,
    );
    expect(view.subscriberText).toBe("999人");
    expect(view.nextMilestoneText).toBe("1,000人");
    expect(view.milestoneRemainingText).toBe("1人");
  });

  test("登録者数が非公開/未取得(null)でも動画本数・動画本数の表記は常に算出される", () => {
    const view = buildChannelStatsView(
      { subscriberCount: null, viewCount: 500, fetchedAt: "2026-08-01T09:00:00Z" },
      12,
      now,
    );
    expect(view.subscriberText).toBeNull();
    expect(view.nextMilestoneText).toBeNull();
    expect(view.milestoneRemainingText).toBeNull();
    expect(view.videoCountText).toBe("12本");
    // 非公開設定であってfetchedAtはあるため、更新失敗ではなく最終更新時刻を表示する
    expect(view.fetchedAtText).toBe("8/1 18:00時点");
    expect(view.updateFailedText).toBeNull();
  });

  test("fetchedAt が null(一度も取得に成功していない)場合は updateFailedText が入り、fetchedAtText は null になる", () => {
    const view = buildChannelStatsView(createEmptyChannelStats(), 5, now);
    expect(view.fetchedAtText).toBeNull();
    expect(view.updateFailedText).toBe("更新失敗(登録者数・総再生回数は取得できていません)");
  });

  test("fetchedAtText と updateFailedText は排他的(どちらか一方だけが入る)", () => {
    const success = buildChannelStatsView(
      { subscriberCount: 1, viewCount: 1, fetchedAt: "2026-08-01T09:00:00Z" },
      1,
      now,
    );
    expect(success.fetchedAtText).not.toBeNull();
    expect(success.updateFailedText).toBeNull();

    const failure = buildChannelStatsView(createEmptyChannelStats(), 1, now);
    expect(failure.fetchedAtText).toBeNull();
    expect(failure.updateFailedText).not.toBeNull();
  });

  test("fetchedAt が不正な日時文字列(パース不能)の場合も updateFailedText が入る(#438: 排他性の維持)", () => {
    // formatFetchedAt は不正な日時文字列に対して例外ではなく空文字列を返す(#80)。
    // fetchedAt 自体は non-null なので、空文字を null に正規化しないと
    // fetchedAtText / updateFailedText が両方とも実質「空」になってしまう。
    const view = buildChannelStatsView(
      { subscriberCount: 1, viewCount: 1, fetchedAt: "not-a-date" },
      1,
      now,
    );
    expect(view.fetchedAtText).toBeNull();
    expect(view.updateFailedText).toBe("更新失敗(登録者数・総再生回数は取得できていません)");
  });
});
