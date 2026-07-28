import { describe, expect, test } from "bun:test";
import { extractSearchableText, formatDateJa, truncate } from "./format";

describe("formatDateJa", () => {
  test("日本時間の年月日に整形する", () => {
    expect(formatDateJa("2026-07-01T12:00:00+09:00")).toBe("2026年7月1日");
  });

  test("UTC の日時もタイムゾーン変換される(日付をまたぐケース)", () => {
    // UTC 15:30 = JST 翌日 0:30
    expect(formatDateJa("2026-06-30T15:30:00Z")).toBe("2026年7月1日");
  });

  test("不正な日時は空文字", () => {
    expect(formatDateJa("invalid")).toBe("");
  });
});

describe("truncate", () => {
  test("上限以内はそのまま", () => {
    expect(truncate("こんにちは", 5)).toBe("こんにちは");
  });

  test("超過分は切り詰めて…を付与", () => {
    expect(truncate("こんにちは世界", 5)).toBe("こんにちは…");
  });

  test("サロゲートペア(絵文字)を壊さない", () => {
    expect(truncate("😀😀😀😀", 2)).toBe("😀😀…");
  });
});

describe("extractSearchableText", () => {
  test("最初の「【」より前の本文だけを取り出す", () => {
    const description = "#ai #vlog\n\n本文の内容です。\n\n【Profile】\n定型文...";
    expect(extractSearchableText(description)).toBe("#ai #vlog\n\n本文の内容です。");
  });

  test("「【」が無ければ全文を trim して返す", () => {
    expect(extractSearchableText("  本文のみの概要欄です。  ")).toBe("本文のみの概要欄です。");
  });

  test("空文字は空文字のまま", () => {
    expect(extractSearchableText("")).toBe("");
  });
});
