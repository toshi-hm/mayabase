import { describe, expect, test } from "bun:test";
import { noteUrl, site, subscribeUrl } from "./site";

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

  test("Storefront URL は https で始まる(#119)", () => {
    expect(site.gear.storefrontUrl.startsWith("https://")).toBe(true);
  });
});

describe("subscribeUrl", () => {
  test("チャンネルURLに sub_confirmation=1 を付与する", () => {
    expect(subscribeUrl()).toBe(`${site.youtube.url}?sub_confirmation=1`);
  });

  test("常にチャンネルURLを起点にする", () => {
    expect(subscribeUrl().startsWith(site.youtube.url)).toBe(true);
  });
});

describe("noteUrl", () => {
  test("note のクリエイターページを指す", () => {
    expect(site.note.url).toBe(`https://note.com/${site.note.account}`);
    expect(new URL(noteUrl("home")).origin + new URL(noteUrl("home")).pathname).toBe(site.note.url);
  });

  test("設置箇所ごとの UTM パラメータを付与する", () => {
    const url = new URL(noteUrl("video-detail"));
    expect(url.searchParams.get("utm_source")).toBe("mayabase");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
    expect(url.searchParams.get("utm_campaign")).toBe("video-detail");
  });
});
