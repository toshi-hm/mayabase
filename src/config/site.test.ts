import { describe, expect, test } from "bun:test";
import { site } from "./site";

describe("site config", () => {
  test("YouTube ハンドルは @ で始まる", () => {
    expect(site.youtube.handle.startsWith("@")).toBe(true);
  });

  test("YouTube URL はハンドルと一致する", () => {
    expect(site.youtube.url).toContain(site.youtube.handle);
  });

  test("channelId は空か UC で始まる", () => {
    expect(site.youtube.channelId === "" || site.youtube.channelId.startsWith("UC")).toBe(true);
  });

  test("X アカウントは @ を含まない", () => {
    expect(site.x.account.includes("@")).toBe(false);
    expect(site.x.url).toContain(site.x.account);
  });

  test("カルーセル設定が妥当な範囲", () => {
    expect(site.carousel.autoplayDelayMs).toBeGreaterThanOrEqual(1000);
    expect(site.carousel.maxItems).toBeGreaterThan(0);
    expect(site.carousel.maxItems).toBeLessThanOrEqual(6);
  });
});
