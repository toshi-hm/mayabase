import { describe, expect, test } from "bun:test";
import { isAugmentedClick } from "./clickGuard";

describe("isAugmentedClick", () => {
  test("左クリック単体はfalse(通常のクリック)", () => {
    expect(
      isAugmentedClick({
        button: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(false);
  });

  test("中クリック(button !== 0)はtrue", () => {
    expect(
      isAugmentedClick({
        button: 1,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(true);
  });

  test.each([
    "ctrlKey",
    "metaKey",
    "shiftKey",
    "altKey",
  ] as const)("%s 押下時はtrue", (modifier) => {
    expect(
      isAugmentedClick({
        button: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        [modifier]: true,
      }),
    ).toBe(true);
  });
});
