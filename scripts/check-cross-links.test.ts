import { describe, expect, test } from "bun:test";
import type { GearData } from "../src/lib/gear";
import type { GlossaryData } from "../src/lib/glossary";
import type { Video } from "../src/lib/youtube";
import {
  buildCrossLinkReport,
  findOrphanedGearItems,
  findOrphanedGlossaryItems,
} from "./check-cross-links";

function makeVideo(id: string): Video {
  return {
    id,
    title: `動画${id}`,
    description: "",
    publishedAt: "2024-01-01T00:00:00Z",
    isShort: false,
    viewCount: null,
    duration: null,
  };
}

const videos: Video[] = [makeVideo("v1"), makeVideo("v2")];

describe("findOrphanedGearItems", () => {
  test("videoIds が動画に解決できる項目は孤立扱いしない", () => {
    const gear: GearData = {
      items: [
        {
          name: "製品A",
          brand: "ブランドA",
          category: "desk",
          url: "https://amzn.to/a",
          videoIds: ["v1"],
        },
      ],
    };
    expect(findOrphanedGearItems(gear, videos)).toEqual([]);
  });

  test("videoIds 未設定の項目は孤立として抽出する", () => {
    const gear: GearData = {
      items: [{ name: "製品B", brand: "ブランドB", category: "desk", url: "https://amzn.to/b" }],
    };
    expect(findOrphanedGearItems(gear, videos)).toEqual(gear.items);
  });

  test("videoIds が videos.json に存在しないIDのみの項目も孤立として抽出する", () => {
    const gear: GearData = {
      items: [
        {
          name: "製品C",
          brand: "ブランドC",
          category: "desk",
          url: "https://amzn.to/c",
          videoIds: ["deleted-video"],
        },
      ],
    };
    expect(findOrphanedGearItems(gear, videos)).toEqual(gear.items);
  });

  test("items が空なら空配列", () => {
    expect(findOrphanedGearItems({ items: [] }, videos)).toEqual([]);
  });
});

describe("findOrphanedGlossaryItems", () => {
  const gearItems: GearData["items"] = [
    { name: "製品A", brand: "ブランドA", category: "desk", url: "https://amzn.to/a" },
  ];

  test("relatedVideoIds が解決できる項目は孤立扱いしない", () => {
    const glossary: GlossaryData = {
      items: [{ term: "用語1", definition: "説明1", relatedVideoIds: ["v1"] }],
    };
    expect(findOrphanedGlossaryItems(glossary, videos, gearItems)).toEqual([]);
  });

  test("relatedGearNames が解決できる項目は孤立扱いしない", () => {
    const glossary: GlossaryData = {
      items: [{ term: "用語2", definition: "説明2", relatedGearNames: ["製品A"] }],
    };
    expect(findOrphanedGlossaryItems(glossary, videos, gearItems)).toEqual([]);
  });

  test("動画・ガジェットのどちらにも解決できない項目は孤立として抽出する", () => {
    const glossary: GlossaryData = {
      items: [
        { term: "用語3", definition: "説明3" },
        { term: "用語4", definition: "説明4", relatedVideoIds: ["deleted-video"] },
        { term: "用語5", definition: "説明5", relatedGearNames: ["存在しない製品"] },
      ],
    };
    expect(findOrphanedGlossaryItems(glossary, videos, gearItems)).toEqual(glossary.items);
  });

  test("items が空なら空配列", () => {
    expect(findOrphanedGlossaryItems({ items: [] }, videos, gearItems)).toEqual([]);
  });
});

describe("buildCrossLinkReport", () => {
  test("孤立項目が無ければ hasOrphans は false", () => {
    const report = buildCrossLinkReport([], []);
    expect(report.hasOrphans).toBe(false);
    expect(report.orphanedGearCount).toBe(0);
    expect(report.orphanedGlossaryCount).toBe(0);
    expect(report.summary).toBe(
      "gear.json / glossary.json のクロスリンクに孤立した項目はありませんでした。",
    );
  });

  test("孤立したガジェットのみの場合、gear のみサマリに含める", () => {
    const report = buildCrossLinkReport(
      [{ name: "製品A", brand: "ブランドA", category: "desk", url: "https://amzn.to/a" }],
      [],
    );
    expect(report.hasOrphans).toBe(true);
    expect(report.orphanedGearCount).toBe(1);
    expect(report.orphanedGlossaryCount).toBe(0);
    expect(report.summary).toContain("ブランドA 製品A");
    expect(report.summary).not.toContain("用語集");
  });

  test("孤立した用語集のみの場合、glossary のみサマリに含める", () => {
    const report = buildCrossLinkReport([], [{ term: "用語1", definition: "説明1" }]);
    expect(report.hasOrphans).toBe(true);
    expect(report.orphanedGearCount).toBe(0);
    expect(report.orphanedGlossaryCount).toBe(1);
    expect(report.summary).toContain("用語1");
    expect(report.summary).not.toContain("**愛用ガジェット(gear.json)**");
  });

  test("両方孤立している場合、両方のセクションをサマリに含める", () => {
    const report = buildCrossLinkReport(
      [{ name: "製品A", brand: "ブランドA", category: "desk", url: "https://amzn.to/a" }],
      [{ term: "用語1", definition: "説明1" }],
    );
    expect(report.summary).toContain("ブランドA 製品A");
    expect(report.summary).toContain("用語1");
  });
});
