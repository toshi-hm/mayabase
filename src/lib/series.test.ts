import { describe, expect, test } from "bun:test";
import seriesJson from "../data/series.json";
import videosJson from "../data/videos.json";
import {
  getSeriesWithVideos,
  isInSeries,
  isVideoInSeries,
  parseSeriesData,
  seriesUrl,
} from "./series";
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

  test("keyword と youtubePlaylistId のどちらも無ければ throw する(#408)", () => {
    const { keyword, ...withoutKeyword } = validItem;
    expect(() => parseSeriesData({ series: [withoutKeyword] })).toThrow(
      "keyword または youtubePlaylistId",
    );
  });

  test("youtubePlaylistId のみでも成立する(#408)", () => {
    const { keyword, ...withoutKeyword } = validItem;
    const { series } = parseSeriesData({
      series: [{ ...withoutKeyword, youtubePlaylistId: "PLabc123XYZ_-9" }],
    });
    expect(series[0]?.youtubePlaylistId).toBe("PLabc123XYZ_-9");
    expect(series[0]?.keyword).toBeUndefined();
  });

  test("youtubePlaylistId の形式が不正なら throw する(#408)", () => {
    expect(() =>
      parseSeriesData({ series: [{ ...validItem, youtubePlaylistId: "不正なID" }] }),
    ).toThrow("youtubePlaylistId");
    expect(() => parseSeriesData({ series: [{ ...validItem, youtubePlaylistId: "" }] })).toThrow(
      "youtubePlaylistId",
    );
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
    if (!futatsuNoWaraji?.keyword) {
      throw new Error("series.json に futatsu-no-waraji の keyword が見つかりません");
    }
    const keyword = futatsuNoWaraji.keyword;
    const seriesVideos = videos.filter((video) => isInSeries(video, keyword));
    // 実データでは 94 件中 56 件が該当することを確認済み(#174)。
    // 動画データは自動更新で増減するため、範囲を持たせた回帰チェックにする。
    expect(seriesVideos.length).toBeGreaterThan(0);
    expect(seriesVideos.length).toBeLessThanOrEqual(videos.length);
  });
});

describe("isVideoInSeries", () => {
  const playlistItem = {
    slug: "shorts-series",
    title: "テストシリーズ",
    youtubePlaylistId: "PLtest123",
    description: "テスト用シリーズ",
  };

  test("キーワードが一致すれば true(youtubePlaylistId未設定)", () => {
    expect(
      isVideoInSeries(makeVideo({ id: "v1", title: "【二足のわらじ】1本目" }), validItem),
    ).toBe(true);
  });

  test("keyword未設定でも再生リストに含まれていれば true(#408)", () => {
    const video = makeVideo({ id: "v1", title: "無関係なタイトル" });
    expect(isVideoInSeries(video, playlistItem, new Set(["v1"]))).toBe(true);
  });

  test("keyword未設定かつ再生リストにも含まれなければ false(#408)", () => {
    const video = makeVideo({ id: "v2", title: "無関係なタイトル" });
    expect(isVideoInSeries(video, playlistItem, new Set(["v1"]))).toBe(false);
  });

  test("youtubePlaylistIdが設定されていてもplaylistVideoIdsを渡さなければ false(#408)", () => {
    const video = makeVideo({ id: "v1", title: "無関係なタイトル" });
    expect(isVideoInSeries(video, playlistItem)).toBe(false);
  });

  test("キーワード・再生リストのどちらか一方でも一致すれば true(OR条件・#408)", () => {
    const hybridItem = { ...playlistItem, keyword: "二足のわらじ" };
    const video = makeVideo({ id: "v9", title: "【二足のわらじ】特別編" });
    expect(isVideoInSeries(video, hybridItem, new Set())).toBe(true);
  });
});

describe("seriesUrl", () => {
  test("シリーズアーカイブページの URL を返す", () => {
    expect(seriesUrl("futatsu-no-waraji")).toBe("/videos/series/futatsu-no-waraji/");
  });
});

describe("getSeriesWithVideos", () => {
  const seriesA = { ...validItem, slug: "series-a", keyword: "二足のわらじ" };
  const seriesB = {
    ...validItem,
    slug: "series-b",
    title: "別シリーズ",
    keyword: "存在しない企画",
  };

  test("各シリーズに該当動画を紐付ける", () => {
    const videos = [
      makeVideo({ id: "v1", title: "【二足のわらじ】1本目" }),
      makeVideo({ id: "v2", title: "無関係な動画" }),
    ];
    const result = getSeriesWithVideos([seriesA], videos);
    expect(result).toHaveLength(1);
    expect(result[0]?.series).toEqual(seriesA);
    expect(result[0]?.videos.map((v) => v.id)).toEqual(["v1"]);
  });

  test("該当動画が1件もないシリーズは除外する", () => {
    const videos = [makeVideo({ id: "v1", title: "【二足のわらじ】1本目" })];
    const result = getSeriesWithVideos([seriesA, seriesB], videos);
    expect(result.map((entry) => entry.series.slug)).toEqual(["series-a"]);
  });

  test("実データ(series.json / videos.json)で1件以上のシリーズが返る(回帰テスト)", () => {
    const { series } = parseSeriesData(seriesJson);
    const { videos } = parseVideosData(videosJson);
    const result = getSeriesWithVideos(series, videos);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry.videos.length).toBeGreaterThan(0);
    }
  });

  test("youtubePlaylistId経由の動画も紐付けられる(#408)", () => {
    const { keyword, ...withoutKeyword } = seriesB;
    const playlistOnlySeries = { ...withoutKeyword, youtubePlaylistId: "PLtest123" };
    const videos = [
      makeVideo({ id: "v1", title: "無関係なタイトル" }),
      makeVideo({ id: "v2", title: "こちらも無関係" }),
    ];
    const playlistIndex = new Map([["PLtest123", new Set(["v1"])]]);
    const result = getSeriesWithVideos([playlistOnlySeries], videos, playlistIndex);
    expect(result).toHaveLength(1);
    expect(result[0]?.videos.map((v) => v.id)).toEqual(["v1"]);
  });

  test("playlistIndexを省略した場合はキーワード判定のみになる(後方互換・#408)", () => {
    const videos = [makeVideo({ id: "v1", title: "【二足のわらじ】1本目" })];
    const result = getSeriesWithVideos([seriesA], videos);
    expect(result[0]?.videos.map((v) => v.id)).toEqual(["v1"]);
  });
});
