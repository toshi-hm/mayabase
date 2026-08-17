import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import { futatsuNoWarajiSeriesUrl, isFutatsuNoWarajiSeries } from "./series";
import type { Video } from "./youtube";
import { parseVideosData } from "./youtube";

function makeVideo(overrides: Partial<Video> & { id: string }): Video {
  return {
    title: overrides.id,
    publishedAt: "2026-01-01T00:00:00Z",
    description: "",
    isShort: false,
    viewCount: null,
    ...overrides,
  };
}

describe("isFutatsuNoWarajiSeries", () => {
  test("タイトルに「二足のわらじ」を含む動画は true", () => {
    expect(
      isFutatsuNoWarajiSeries({ title: "【二足のわらじ】社会人大学院生の1週間ルーティン" }),
    ).toBe(true);
  });

  test("タイトルに「二足のわらじ」を含まない動画は false", () => {
    expect(isFutatsuNoWarajiSeries({ title: "【購入品】買ってよかったガジェット5選" })).toBe(false);
  });

  test("実データ(videos.json)で該当件数が想定範囲内である", () => {
    const { videos } = parseVideosData(videosJson);
    const seriesVideos = videos.filter((video) => isFutatsuNoWarajiSeries(video));
    // 実データでは 94 件中 56 件が該当することを確認済み(#174)。
    // 動画データは自動更新で増減するため、範囲を持たせた回帰チェックにする。
    expect(seriesVideos.length).toBeGreaterThan(0);
    expect(seriesVideos.length).toBeLessThanOrEqual(videos.length);
  });

  test("マルチバイト文字の一部一致では誤検知しない", () => {
    expect(
      isFutatsuNoWarajiSeries(makeVideo({ id: "no-match", title: "二足歩行ロボット特集" })),
    ).toBe(false);
  });
});

describe("futatsuNoWarajiSeriesUrl", () => {
  test("シリーズアーカイブページの URL を返す", () => {
    expect(futatsuNoWarajiSeriesUrl()).toBe("/videos/series/futatsu-no-waraji/");
  });
});
