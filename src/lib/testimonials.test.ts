import { describe, expect, test } from "bun:test";
import testimonialsJson from "../data/testimonials.json";
import { parseTestimonialsData } from "./testimonials";

const valid = {
  id: "viewer-1",
  quote: "動画が分かりやすくて助かりました。",
  author: "視聴者",
  sourceUrl: "https://example.com/post",
};

describe("parseTestimonialsData", () => {
  test("正常なデータをパースする", () => {
    expect(parseTestimonialsData({ testimonials: [valid] })).toEqual({ testimonials: [valid] });
  });

  test("空配列を許容する", () => {
    expect(parseTestimonialsData({ testimonials: [] })).toEqual({ testimonials: [] });
  });

  test("必須フィールド・ID重複・URLを検証する", () => {
    expect(() => parseTestimonialsData(null)).toThrow("オブジェクト");
    expect(() => parseTestimonialsData({})).toThrow("配列");
    expect(() => parseTestimonialsData({ testimonials: [{ ...valid, quote: "" }] })).toThrow(
      "quote",
    );
    expect(() => parseTestimonialsData({ testimonials: [{ ...valid, id: "bad id" }] })).toThrow(
      "id",
    );
    expect(() =>
      parseTestimonialsData({ testimonials: [valid, { ...valid, quote: "別の声" }] }),
    ).toThrow("id");
    expect(() =>
      parseTestimonialsData({ testimonials: [{ ...valid, sourceUrl: "javascript:alert(1)" }] }),
    ).toThrow("sourceUrl");
  });

  test("初期の手動データがスキーマを満たす", () => {
    expect(parseTestimonialsData(testimonialsJson)).toEqual({ testimonials: [] });
  });
});
