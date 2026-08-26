import { describe, expect, test } from "bun:test";
import seriesJson from "../data/series.json";
import videosJson from "../data/videos.json";
import { isInSeries, parseSeriesData, seriesUrl } from "./series";
import type { Video } from "./youtube";
import { parseVideosData } from "./youtube";

function makeVideo(overrides: Partial<Video> & { id: string }): Video {
  return {
    title: overrides.id,
    publishedAt: "2026-01-01T00:00:00Z",
    description: "",
    isShort: false,
    viewCount: null,
    duration: null,
    ...overrides,
  };
}

const validItem = {
  slug: "futatsu-no-waraji",
  title: "二足のわらじシリーズ",
  keyword: "二足のわらじ",
  description:
    "エンジニアとして働きながら大学院にも通う「二足のわらじ」生活を追いかけるシリーズです。",
};

describe("parseSeriesData", () => {
  test("正常なデータをパースできる", () => {
    const { series } = parseSeriesData({ series: [validItem] });
    expect(series).toHaveLength(1);
    expect(series[0]).toEqual(validItem);
  });

  test("オブジェクトでなければ throw する", () => {
    expect(() => parseSeriesData(null)).toThrow("オブジェクトではありません");
    expect(() => parseSeriesData({})).toThrow("series は配列");
  });

  test("slug が半角英小文字・数字・ハイフン以外を含む場合は throw する", () => {
    expect(() => parseSeriesData({ series: [{ ...validItem, slug: "Futatsu" }] })).toThrow("slug");
    expect(() =>
      parseSeriesData({ series: [{ ...validItem, slug: "futatsu_no_waraji" }] }),
    ).toThrow("slug");
    expect(() => parseSeriesData({ series: [{ ...validItem, slug: "二足のわらじ" }] })).toThrow(
      "slug",
    );
    expect(() => parseSeriesData({ series: [{ ...validItem, slug: "-leading-hyphen" }] })).toThrow(
      "slug",
    );
    expect(() => parseSeriesData({ series: [{ ...validItem, slug: "" }] })).toThrow("slug");
  });

  test("slug が重複する場合は throw する", () => {
    expect(() =>
      parseSeriesData({ series: [validItem, { ...validItem, title: "別タイトル" }] }),
    ).toThrow("重複");
  });

  test("title / keyword / description の欠損や型不正は throw する", () => {
    expect(() => parseSeriesData({ series: [{ ...validItem, title: "" }] })).toThrow("title");
    expect(() => parseSeriesData({ series: [{ ...validItem, keyword: 1 }] })).toThrow("keyword");
    expect(() => parseSeriesData({ series: [{ ...validItem, description: undefined }] })).toThrow(
      "description",
    );
  });

  test("実データ(series.json)がスキーマを満たす(回帰テスト)", () => {
    const { series } = parseSeriesData(seriesJson);
    expect(series.length).toBeGreaterThan(0);
  });
});

describe("isInSeries", () => {
  test("タイトルにキーワードを含む動画は true", () => {
    expect(
      isInSeries({ title: "【二足のわらじ】社会人大学院生の1週間ルーティン" }, "二足のわらじ"),
    ).toBe(true);
  });

  test("タイトルにキーワードを含まない動画は false", () => {
    expect(isInSeries({ title: "【購入品】買ってよかったガジェット5選" }, "二足のわらじ")).toBe(
      false,
    );
  });

  test("マルチバイト文字の一部一致では誤検知しない", () => {
    expect(
      isInSeries(makeVideo({ id: "no-match", title: "二足歩行ロボット特集" }), "二足のわらじ"),
    ).toBe(false);
  });

  test("実データ(videos.json)で該当件数が想定範囲内である(#174 の回帰テストを汎用化)", () => {
    const { videos } = parseVideosData(videosJson);
    const { series } = parseSeriesData(seriesJson);
    const futatsuNoWaraji = series.find((item) => item.slug === "futatsu-no-waraji");
    if (!futatsuNoWaraji) {
      throw new Error("series.json に futatsu-no-waraji が見つかりません");
    }
    const seriesVideos = videos.filter((video) => isInSeries(video, futatsuNoWaraji.keyword));
    // 実データでは 94 件中 56 件が該当することを確認済み(#174)。
    // 動画データは自動更新で増減するため、範囲を持たせた回帰チェックにする。
    expect(seriesVideos.length).toBeGreaterThan(0);
    expect(seriesVideos.length).toBeLessThanOrEqual(videos.length);
  });
});

describe("seriesUrl", () => {
  test("シリーズアーカイブページの URL を返す", () => {
    expect(seriesUrl("futatsu-no-waraji")).toBe("/videos/series/futatsu-no-waraji/");
  });
});
