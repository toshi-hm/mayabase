import { describe, expect, test } from "bun:test";
import { getLightboxContainerClass, parseLightboxAspect } from "./lightbox";

describe("getLightboxContainerClass", () => {
  test("video は横型(16:9)の全幅クラスを返す", () => {
    expect(getLightboxContainerClass("video")).toBe("bg-black aspect-video w-full");
  });

  test("short は縦型(9:16)の高さ制限付きクラスを返す", () => {
    expect(getLightboxContainerClass("short")).toBe(
      "bg-black mx-auto aspect-[9/16] w-auto max-h-[70vh]",
    );
  });
});

describe("parseLightboxAspect", () => {
  test("short はそのまま short になる", () => {
    expect(parseLightboxAspect("short")).toBe("short");
  });

  test("video・未指定・不正な値はすべて video にフォールバックする", () => {
    expect(parseLightboxAspect("video")).toBe("video");
    expect(parseLightboxAspect(undefined)).toBe("video");
    expect(parseLightboxAspect("")).toBe("video");
    expect(parseLightboxAspect("tall")).toBe("video");
  });
});
