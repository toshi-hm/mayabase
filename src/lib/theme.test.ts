import { describe, expect, test } from "bun:test";
import {
  isTheme,
  nextTheme,
  parseStoredTheme,
  resolveTheme,
  themeClassName,
  themeColorMedia,
} from "./theme";

describe("isTheme", () => {
  test("system / light / dark はいずれも妥当", () => {
    expect(isTheme("system")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  test("不正な文字列は false", () => {
    expect(isTheme("Dark")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme("auto")).toBe(false);
  });

  test("文字列以外は false", () => {
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});

describe("parseStoredTheme", () => {
  test("localStorage 未設定(null)は system", () => {
    expect(parseStoredTheme(null)).toBe("system");
  });

  test("不正な値は system にフォールバックする", () => {
    expect(parseStoredTheme("")).toBe("system");
    expect(parseStoredTheme("blue")).toBe("system");
  });

  test("妥当な値はそのまま返す", () => {
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("dark")).toBe("dark");
    expect(parseStoredTheme("system")).toBe("system");
  });
});

describe("nextTheme", () => {
  test("system → light → dark → system の順で循環する", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
});

describe("resolveTheme", () => {
  test("system は OS のダーク設定に従う", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("手動選択時は OS の設定に関わらずそのまま優先される", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeClassName", () => {
  test("実効テーマに対応するクラス名を返す", () => {
    expect(themeClassName("dark")).toBe("theme-dark");
    expect(themeClassName("light")).toBe("theme-light");
  });
});

describe("themeColorMedia", () => {
  test("system 選択時は元の prefers-color-scheme クエリを維持する", () => {
    expect(themeColorMedia("system", "light")).toEqual({
      light: "(prefers-color-scheme: light)",
      dark: "(prefers-color-scheme: dark)",
    });
    expect(themeColorMedia("system", "dark")).toEqual({
      light: "(prefers-color-scheme: light)",
      dark: "(prefers-color-scheme: dark)",
    });
  });

  test("手動 light 選択時は light 側のみ有効化する", () => {
    expect(themeColorMedia("light", "light")).toEqual({ light: "all", dark: "not all" });
  });

  test("手動 dark 選択時は dark 側のみ有効化する", () => {
    expect(themeColorMedia("dark", "dark")).toEqual({ light: "not all", dark: "all" });
  });
});
