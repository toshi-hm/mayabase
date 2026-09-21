import { describe, expect, test } from "bun:test";
import { site } from "../config/site";
import { buildOwnerPersonJsonLd } from "./personJsonLd";

const SITE_URL = "https://portal.mayabase.workers.dev/";

describe("buildOwnerPersonJsonLd", () => {
  test("@type が Person になる", () => {
    expect(buildOwnerPersonJsonLd(SITE_URL)["@type"]).toBe("Person");
  });

  test("@id が siteUrl 起点の #owner フラグメントになる", () => {
    expect(buildOwnerPersonJsonLd(SITE_URL)["@id"]).toBe(
      "https://portal.mayabase.workers.dev/#owner",
    );
  });

  test("site.profile の値をそのまま引き継ぐ", () => {
    const result = buildOwnerPersonJsonLd(SITE_URL);
    expect(result.name).toBe(site.profile.name);
    expect(result.description).toBe(site.profile.bio);
  });

  test("url は siteUrl そのもの", () => {
    expect(buildOwnerPersonJsonLd(SITE_URL).url).toBe(SITE_URL);
  });

  test("sameAs に YouTube・X の URL を含む", () => {
    expect(buildOwnerPersonJsonLd(SITE_URL).sameAs).toEqual([site.youtube.url, site.x.url]);
  });

  test("siteUrl が異なれば @id・url もそれに追従する", () => {
    const other = "https://example.com/";
    const result = buildOwnerPersonJsonLd(other);
    expect(result["@id"]).toBe("https://example.com/#owner");
    expect(result.url).toBe(other);
  });
});
