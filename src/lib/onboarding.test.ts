import { describe, expect, test } from "bun:test";
import { buildOnboardingPanels } from "./onboarding";
import type { Video } from "./youtube";

const video = (id: string, title = id): Video => ({
  id,
  title,
  description: "",
  publishedAt: "2026-01-01",
  isShort: false,
  viewCount: null,
  duration: null,
});
describe("buildOnboardingPanels", () => {
  test("カテゴリ内ではじめて向け動画を優先し、重複を除く", () => {
    const panels = buildOnboardingPanels(
      [{ category: "ai", label: "AI", videos: [video("a"), video("b")] }],
      [video("b", "AI"), video("z")],
      2,
    );
    expect(panels[0]?.videos.map((item) => item.id)).toEqual(["b", "a"]);
  });
  test("カテゴリ上位外でも同じカテゴリのfeatured動画を優先する", () => {
    const curated = { ...video("curated"), title: "AIで学ぶ" };
    const panels = buildOnboardingPanels(
      [{ category: "ai", label: "AI", videos: [video("a"), video("b")] }],
      [curated],
      3,
    );
    expect(panels[0]?.videos.map((item) => item.id)).toEqual(["curated", "a", "b"]);
  });

  test("動画が無いカテゴリを除外する", () => {
    expect(buildOnboardingPanels([{ category: "empty", label: "空", videos: [] }], [])).toEqual([]);
  });
});
