import { describe, expect, test } from "bun:test";
import { isThinVideo } from "./thinVideo";

describe("isThinVideo", () => {
  test("概要欄が空で再生時間が null なら薄い動画", () => {
    expect(isThinVideo({ description: "", duration: null })).toBe(true);
    expect(isThinVideo({ description: " \n ", duration: null })).toBe(true);
  });
  test("概要欄があれば薄くない", () => {
    expect(isThinVideo({ description: "説明", duration: null })).toBe(false);
  });
  test("再生時間があれば薄くない", () => {
    expect(isThinVideo({ description: "", duration: "PT5M" })).toBe(false);
  });
});
