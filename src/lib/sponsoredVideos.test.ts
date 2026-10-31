import { describe, expect, test } from "bun:test";
import sponsoredJson from "../data/sponsored-videos.json";
import videosJson from "../data/videos.json";
import {
  buildSponsoredCardLabels,
  hasAnySponsoredViewCount,
  hasSponsorNotice,
  parseSponsoredVideosData,
  resolveSponsoredVideos,
} from "./sponsoredVideos";
import { parseVideosData, type Video } from "./youtube";

function v(id: string, description: string): Video {
  return {
    id,
    title: id,
    description,
    publishedAt: "2026-01-01T00:00:00Z",
    isShort: false,
    viewCount: 1,
    duration: null,
  };
}
const entry = (videoId: string, sponsor = "ACME") => ({ videoId, sponsor, summary: "s" });

describe("parseSponsoredVideosData", () => {
  test("正常なデータをパースする", () => {
    expect(
      parseSponsoredVideosData({ sponsoredVideos: [entry("a")] }).sponsoredVideos,
    ).toHaveLength(1);
    expect(parseSponsoredVideosData({ sponsoredVideos: [] }).sponsoredVideos).toEqual([]);
  });
  test("不正データは throw する", () => {
    expect(() => parseSponsoredVideosData(null)).toThrow();
    expect(() => parseSponsoredVideosData({})).toThrow();
    expect(() => parseSponsoredVideosData({ sponsoredVideos: [{ videoId: "a" }] })).toThrow(
      "sponsor",
    );
    expect(() => parseSponsoredVideosData({ sponsoredVideos: [null] })).toThrow();
  });
  test("videoId 重複は throw する", () => {
    expect(() => parseSponsoredVideosData({ sponsoredVideos: [entry("a"), entry("a")] })).toThrow(
      "重複",
    );
  });
});

describe("hasSponsorNotice", () => {
  test("半角・全角コロンの提供表記を検出する", () => {
    expect(hasSponsorNotice(v("a", "提供: ACME"), "ACME")).toBe(true);
    expect(hasSponsorNotice(v("a", "提供：ACME"), "ACME")).toBe(true);
  });
  test("提供表記がない・別企業なら false", () => {
    expect(hasSponsorNotice(v("a", "説明"), "ACME")).toBe(false);
    expect(hasSponsorNotice(v("a", "提供: OTHER"), "ACME")).toBe(false);
  });
  test("正規表現の特殊文字を含む提供元でも壊れない", () => {
    expect(hasSponsorNotice(v("a", "提供: A+B (株)"), "A+B (株)")).toBe(true);
  });
});

describe("resolveSponsoredVideos", () => {
  test("掲載順を維持して解決する", () => {
    const videos = [v("a", "提供: ACME"), v("b", "提供: ACME")];
    expect(resolveSponsoredVideos([entry("b"), entry("a")], videos).map((r) => r.video.id)).toEqual(
      ["b", "a"],
    );
  });
  test("動画が存在しない・提供表記がない場合はスキップし、空でも壊れない", () => {
    const videos = [v("a", "提供なし")];
    expect(resolveSponsoredVideos([entry("a"), entry("missing")], videos)).toEqual([]);
    expect(resolveSponsoredVideos([], [])).toEqual([]);
  });
});

describe("buildSponsoredCardLabels / hasAnySponsoredViewCount (#597)", () => {
  const item = (viewCount: number | null, isShort = false) => ({
    ...entry("a", "ACME"),
    video: { ...v("a", ""), viewCount, isShort },
  });

  test("長尺は「長尺レビュー・提供」と再生回数を返す", () => {
    expect(buildSponsoredCardLabels(item(185))).toEqual({
      metaLabel: "長尺レビュー・提供: ACME",
      viewCountLabel: "185回",
    });
  });
  test("Shortsは種別がShortsになり、1万回以上は万回表記", () => {
    expect(buildSponsoredCardLabels(item(12_000, true))).toEqual({
      metaLabel: "Shorts・提供: ACME",
      viewCountLabel: "1.2万回",
    });
  });
  test("viewCount が null なら再生回数は非表示、0 は 0回 と表示する", () => {
    expect(buildSponsoredCardLabels(item(null)).viewCountLabel).toBeUndefined();
    expect(buildSponsoredCardLabels(item(0)).viewCountLabel).toBe("0回");
  });
  test("hasAnySponsoredViewCount は null のみのとき false、0 を含めば true", () => {
    expect(hasAnySponsoredViewCount([item(null)])).toBe(false);
    expect(hasAnySponsoredViewCount([item(null), item(0)])).toBe(true);
    expect(hasAnySponsoredViewCount([])).toBe(false);
  });
});

describe("実データ", () => {
  test("掲載動画は全て videos.json に存在し、説明欄の提供表記と一致する", () => {
    const { sponsoredVideos } = parseSponsoredVideosData(sponsoredJson);
    const { videos } = parseVideosData(videosJson);
    expect(resolveSponsoredVideos(sponsoredVideos, videos)).toHaveLength(sponsoredVideos.length);
  });
});
