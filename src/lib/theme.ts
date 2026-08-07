/** テーマ設定を保存する localStorage のキー(#135) */
export const THEME_STORAGE_KEY = "mayabase-theme";

/**
 * ユーザーが手動選択できるテーマ。
 * "system" は OS/ブラウザの prefers-color-scheme にそのまま追従する(初期値)。
 */
export type Theme = "system" | "light" | "dark";

/** トグルボタンで巡回する順序。system → light → dark → system … と1クリックずつ進む */
const THEME_CYCLE: readonly Theme[] = ["system", "light", "dark"];

/** 値が Theme として妥当か判定する(localStorage から読んだ値の検証・型ガードに使う) */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEME_CYCLE as readonly string[]).includes(value);
}

/**
 * localStorage から読み出した生の値(未設定の場合は null)から Theme を決定する。
 * 未設定・不正値は "system" として扱う(初期表示は現状通り prefers-color-scheme に従う、#135)。
 */
export function parseStoredTheme(raw: string | null): Theme {
  return isTheme(raw) ? raw : "system";
}

/** トグルボタン1クリック分の遷移先を返す(system → light → dark → system の順で循環) */
export function nextTheme(current: Theme): Theme {
  const index = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? "system";
}

/**
 * 選択中の Theme と OS のダーク設定(prefersDark)から、実際に表示へ適用する
 * 実効テーマ("light" | "dark")を求める。"system" はここで具体値に解決される。
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

/** 実効テーマに対応する `<html>` への付与クラス名(global.css の `.theme-dark` / `.theme-light` と対応) */
export function themeClassName(resolved: "light" | "dark"): "theme-dark" | "theme-light" {
  return resolved === "dark" ? "theme-dark" : "theme-light";
}

/**
 * Base.astro の theme-color メタタグ(light用・dark用の2枚)に設定すべき media 属性値を返す。
 * - "system" 選択時: 元の prefers-color-scheme クエリのまま OS 設定に追従させる。
 * - 手動選択時: 実効テーマ側だけを "all"(常時有効)、もう一方を "not all"(常に無効)にして、
 *   OS のダーク/ライト設定に関わらず選択結果に固定する(手動テーマとの矛盾を防ぐ、#135)。
 */
export function themeColorMedia(
  theme: Theme,
  resolved: "light" | "dark",
): { light: string; dark: string } {
  if (theme === "system") {
    return { light: "(prefers-color-scheme: light)", dark: "(prefers-color-scheme: dark)" };
  }
  return {
    light: resolved === "light" ? "all" : "not all",
    dark: resolved === "dark" ? "all" : "not all",
  };
}
