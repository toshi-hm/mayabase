import { describe, expect, test } from "bun:test";
import videoRelationsJson from "../data/video-relations.json";
import videosJson from "../data/videos.json";
import { getCuratedRelatedVideos, parseVideoRelationsData } from "./videoRelations";
import type { Video } from "./youtube";

const video = (id: string): Video => ({
  id,
  title: id,
  description: "",
  publishedAt: "2026-01-01T00:00:00Z",
  isShort: false,
  viewCount: null,
  duration: null,
});

describe("parseVideoRelationsData", () => {
  test("正常な手動関連データを読み込む", () => {
    expect(
      parseVideoRelationsData({
        relations: [{ videoId: "source", relatedVideoIds: ["target"] }],
      }),
    ).toEqual({
      relations: [{ videoId: "source", relatedVideoIds: ["target"] }],
    });
  });

  test("同じ動画の定義を拒否する", () => {
    expect(() =>
      parseVideoRelationsData({
        relations: [
          { videoId: "source", relatedVideoIds: ["target"] },
          { videoId: "source", relatedVideoIds: ["other"] },
        ],
      }),
    ).toThrow("重複しています");
  });

  test("自身への関連と重複した関連を拒否する", () => {
    expect(() =>
      parseVideoRelationsData({
        relations: [{ videoId: "source", relatedVideoIds: ["target", "target"] }],
      }),
    ).toThrow("重複または自身");
  });

  test("欠損動画は安全に除外する", () => {
    const { relations } = parseVideoRelationsData({
      relations: [{ videoId: "source", relatedVideoIds: ["missing", "target"] }],
    });
    expect(
      getCuratedRelatedVideos("source", [video("target")], relations, 6).map((item) => item.id),
    ).toEqual(["target"]);
  });

  test("入力配列の順序と上限を保つ", () => {
    const { relations } = parseVideoRelationsData({
      relations: [{ videoId: "source", relatedVideoIds: ["first", "second"] }],
    });
    expect(
      getCuratedRelatedVideos("source", [video("second"), video("first")], relations, 1).map(
        (item) => item.id,
      ),
    ).toEqual(["first"]);
  });
});

describe("実データ video-relations.json (#611)", () => {
  const { relations } = parseVideoRelationsData(videoRelationsJson);
  const videoIds = new Set((videosJson as { videos: { id: string }[] }).videos.map((v) => v.id));

  test("新型MacBook ProのShortsと本編が相互に関連付けられている", () => {
    const shorts = relations.find((r) => r.videoId === "GiNlHqeh6XU");
    const main = relations.find((r) => r.videoId === "ES6AidWYsiM");
    expect(shorts?.relatedVideoIds).toEqual(["ES6AidWYsiM"]);
    expect(main?.relatedVideoIds).toEqual(["GiNlHqeh6XU"]);
  });

  test("関連付けは相互で、参照先の動画が videos.json に存在する", () => {
    for (const relation of relations) {
      expect(videoIds.has(relation.videoId)).toBe(true);
      for (const relatedId of relation.relatedVideoIds) {
        expect(videoIds.has(relatedId)).toBe(true);
        const back = relations.find((r) => r.videoId === relatedId);
        expect(back?.relatedVideoIds).toContain(relation.videoId);
      }
    }
  });
});
