import { describe, expect, test } from "bun:test";
import {
  buildLightboxSrc,
  getLightboxContainerClass,
  parseLightboxAspect,
  parseLightboxStartSeconds,
} from "./lightbox";

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

describe("parseLightboxStartSeconds", () => {
  test("正の数値文字列は整数秒に変換する", () => {
    expect(parseLightboxStartSeconds("125")).toBe(125);
  });

  test("小数は切り捨てる", () => {
    expect(parseLightboxStartSeconds("125.9")).toBe(125);
  });

  test("未指定は null(先頭から再生)にする", () => {
    expect(parseLightboxStartSeconds(undefined)).toBeNull();
  });

  test("0 以下・数値でない値は null(先頭から再生と同義)にする", () => {
    expect(parseLightboxStartSeconds("0")).toBeNull();
    expect(parseLightboxStartSeconds("-5")).toBeNull();
    expect(parseLightboxStartSeconds("abc")).toBeNull();
    expect(parseLightboxStartSeconds("")).toBeNull();
  });
});

describe("buildLightboxSrc", () => {
  test("自動再生・関連動画非表示を付与した埋め込み URL を返す", () => {
    expect(buildLightboxSrc("abc123", null)).toBe(
      "https://www.youtube.com/embed/abc123?autoplay=1&rel=0",
    );
  });

  test("開始秒数を指定した場合は start パラメータを付与する", () => {
    expect(buildLightboxSrc("abc123", 90)).toBe(
      "https://www.youtube.com/embed/abc123?autoplay=1&rel=0&start=90",
    );
  });
});
