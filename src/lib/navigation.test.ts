import { describe, expect, test } from "bun:test";
import { isNavCurrent } from "./navigation";

describe("isNavCurrent", () => {
  test("パスが href と完全一致すれば現在地とみなす", () => {
    expect(isNavCurrent("/videos", "/videos/")).toBe(true);
  });

  test("動画個別ページ(/videos/{id}/)のようなネストしたルートも現在地とみなす", () => {
    expect(isNavCurrent("/videos/qF3YSuHxSpc", "/videos/")).toBe(true);
  });

  test("カテゴリアーカイブページ(/videos/category/{category}/)のような深いネストも現在地とみなす", () => {
    expect(isNavCurrent("/videos/category/ai", "/videos/")).toBe(true);
  });

  test("別セクションのパスは現在地とみなさない", () => {
    expect(isNavCurrent("/gear", "/videos/")).toBe(false);
  });

  test("セパレータを挟まない前方一致(/videos-extra 等)は現在地とみなさない", () => {
    expect(isNavCurrent("/videos-extra", "/videos/")).toBe(false);
  });

  test("ホーム(/)は完全一致した場合のみ現在地とみなす", () => {
    expect(isNavCurrent("/", "/")).toBe(true);
    expect(isNavCurrent("/videos", "/")).toBe(false);
  });
});
