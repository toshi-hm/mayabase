import { describe, expect, test } from "bun:test";
import {
  extractSearchableText,
  formatDateJa,
  formatViewCount,
  textMatchesKeyword,
  truncate,
} from "./format";

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

describe("formatViewCount", () => {
  test("1万未満は3桁区切りの回数(#35)", () => {
    expect(formatViewCount(900)).toBe("900回");
    expect(formatViewCount(9999)).toBe("9,999回");
  });

  test("1万以上は「万回」表記(小数第1位、.0 は省略)", () => {
    expect(formatViewCount(10_000)).toBe("1万回");
    expect(formatViewCount(12_345)).toBe("1.2万回");
    expect(formatViewCount(150_000)).toBe("15万回");
  });
});

describe("extractSearchableText", () => {
  test("最初の「【」より前の本文だけを取り出す", () => {
    const description = "本文の内容です。\n\n【Profile】\n定型文...";
    expect(extractSearchableText(description)).toBe("本文の内容です。");
  });

  test("「【」が無ければ全文を trim して返す", () => {
    expect(extractSearchableText("  本文のみの概要欄です。  ")).toBe("本文のみの概要欄です。");
  });

  test("空文字は空文字のまま", () => {
    expect(extractSearchableText("")).toBe("");
  });

  test("冒頭の全動画共通ハッシュタグ行は検索対象から除外する(#79)", () => {
    const description =
      "#chatgpt #gptlive #openai #エンジニア #メガベンチャー #プランナー #ai #it #vlog\n\n本文の内容です。\n\n【Profile】\n定型文...";
    expect(extractSearchableText(description)).toBe("本文の内容です。");
  });

  test("冒頭ハッシュタグ行除外後も本文中の語で検索できる(#79)", () => {
    const description = "#ai #vlog\n\n大学院で学んだことをまとめました。\n\n【Profile】\n定型文...";
    const text = extractSearchableText(description);
    expect(textMatchesKeyword(text, "大学院")).toBe(true);
    expect(textMatchesKeyword(text, "vlog")).toBe(false);
  });

  test("ハッシュタグで始まらない本文はそのまま残る", () => {
    const description = "メガベンチャーで働く1日をお届けします。\n\n【Profile】\n定型文...";
    expect(extractSearchableText(description)).toBe("メガベンチャーで働く1日をお届けします。");
  });
});

describe("textMatchesKeyword", () => {
  test("空のキーワードは常に一致する", () => {
    expect(textMatchesKeyword("何でもいい本文", "")).toBe(true);
  });

  test("英数字キーワードは単語境界で照合する(iPad Air の Air に AI が誤マッチしない)", () => {
    expect(textMatchesKeyword("m4 ipad air ブルー開封", "ai")).toBe(false);
    expect(textMatchesKeyword("openai最新音声ai「gpt-live」", "ai")).toBe(true);
  });

  test("英数字キーワードは大文字小文字を区別しない", () => {
    expect(textMatchesKeyword("ChatGPTを使ってみた", "chatgpt")).toBe(true);
    expect(textMatchesKeyword("chatgptを使ってみた", "CHATGPT")).toBe(true);
  });

  test("日本語を含むキーワードは部分一致で照合する", () => {
    expect(textMatchesKeyword("愛用ガジェットの紹介です", "ガジェット")).toBe(true);
    expect(textMatchesKeyword("旅行の記録です", "ガジェット")).toBe(false);
  });

  test("一致しない場合は false", () => {
    expect(textMatchesKeyword("関係のない本文です", "ai")).toBe(false);
  });

  test("数字始まりの日本語混じりキーワードは日付表記の一部に誤マッチしない", () => {
    expect(textMatchesKeyword("12月31日の記録", "1日")).toBe(false);
    expect(textMatchesKeyword("2026年1月21日のこと", "1日")).toBe(false);
    expect(textMatchesKeyword("エンジニアのリアルな1日", "1日")).toBe(true);
    expect(textMatchesKeyword("新卒2年目 1日ルーティーン", "1日")).toBe(true);
  });
});
