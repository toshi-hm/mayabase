import { describe, expect, test } from "bun:test";
import {
  extractSearchableText,
  formatDateJa,
  formatViewCount,
  isRecentlyPublished,
  linkifyText,
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

describe("isRecentlyPublished", () => {
  const now = new Date("2026-09-06T00:00:00Z");

  test("公開から7日以内なら true", () => {
    expect(isRecentlyPublished("2026-09-01T00:00:00Z", now)).toBe(true);
    expect(isRecentlyPublished("2026-09-06T00:00:00Z", now)).toBe(true);
  });

  test("8日以上前・未来・不正な日時は false", () => {
    expect(isRecentlyPublished("2026-08-29T23:59:59Z", now)).toBe(false);
    expect(isRecentlyPublished("2026-09-07T00:00:00Z", now)).toBe(false);
    expect(isRecentlyPublished("invalid", now)).toBe(false);
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
  test("定型署名欄「【Profile】」より前の本文だけを取り出す", () => {
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

  test("本文内容の見出し「【もくじ】」「【紹介した商品】」は除外せず残す(#234)", () => {
    const description =
      "#anker #ガジェット\n\n【紹介した商品】\n・Anker Prime ドッキングステーション\nhttps://amzn.to/xxx\n\n" +
      "【もくじ】\n0:00 導入\n1:28 特徴\n\n【Profile】\n定型文...";
    const text = extractSearchableText(description);
    expect(text).toContain("紹介した商品");
    expect(text).toContain("Anker Prime ドッキングステーション");
    expect(text).toContain("もくじ");
    expect(text).not.toContain("定型文");
  });

  test("冒頭ハッシュタグ直後に本文の見出しが来ても本文が空文字にならない(#234, z5O2lQteSQg 相当)", () => {
    const description =
      "#anker #dockingstation #ガジェット #8k \n\n【紹介した商品】\n・Anker Prime ドッキングステーション (14-in-1)\nhttps://amzn.to/3LiE6s9\n\n" +
      "【もくじ】\n0:00 ドッキングステーションについて\n\n【Profile】\n新卒でメガベンチャーにエンジニアとして入社。\n\n" +
      "【SNS】\nX\nhttps://x.com/MayaBaseJP\n\n【連絡先】\nmayabaseofficial☆gmail.com\n\n" +
      "【使用ガジェット・デバイス一覧】\n・キーボード：HHKB";
    expect(extractSearchableText(description)).not.toBe("");
  });

  test("「使用ガジェット」「ご質問はこちら」「高評価」「チャンネル登録」見出しも定型欄として除外する", () => {
    expect(extractSearchableText("本文。\n\n【使用ガジェット・デバイス一覧】\n・キーボード")).toBe(
      "本文。",
    );
    expect(extractSearchableText("本文。\n\n【ご質問はこちらから！】\nコメント欄へ")).toBe(
      "本文。",
    );
    expect(extractSearchableText("本文。\n\n【高評価👍】\nお願いします")).toBe("本文。");
    expect(extractSearchableText("本文。\n\n【チャンネル登録🔔】\nお願いします")).toBe("本文。");
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

  test("記号で始まる/終わる英数字キーワードにも一致する(#126)", () => {
    expect(textMatchesKeyword("I love #chatgpt today", "#chatgpt")).toBe(true);
    expect(textMatchesKeyword("I code in C++ daily", "C++")).toBe(true);
    expect(textMatchesKeyword("no hashtag here", "#chatgpt")).toBe(false);
  });

  test("記号で始まる/終わるキーワードも単語境界の誤マッチは防ぐ", () => {
    // "#chatgpt" が "#chatgptbot" のような後続文字列の一部にマッチしない
    expect(textMatchesKeyword("check #chatgptbot out", "#chatgpt")).toBe(false);
  });

  test("全角数字を含むタイトルを半角キーワードで検索できる(#241)", () => {
    const title = "23歳 エンジニア兼大学院生の１日【二足のわらじ】【 #Vlog 】";
    expect(textMatchesKeyword(title, "1日")).toBe(true);
    expect(textMatchesKeyword(title, "１日")).toBe(true);
  });

  test("全角英数字キーワードでも半角英数字を含むテキストを検索できる(#241)", () => {
    expect(textMatchesKeyword("M4 iPad Airのレビュー", "Ａｉｒ")).toBe(true);
  });
});

describe("linkifyText", () => {
  test("URLを含まないテキストはそのまま(HTMLエスケープのみ)返す", () => {
    expect(linkifyText("ただの本文です")).toBe("ただの本文です");
  });

  test("URLを <a> タグに変換する", () => {
    expect(linkifyText("詳細はこちら https://example.com/page です")).toBe(
      '詳細はこちら <a href="https://example.com/page" target="_blank" rel="noopener noreferrer">https://example.com/page</a> です',
    );
  });

  test("文末の句読点・括弧はリンクに含めない", () => {
    expect(linkifyText("参考(https://example.com/a)。")).toBe(
      '参考(<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a>)。',
    );
  });

  test("1行に複数URLがあればそれぞれ変換する", () => {
    expect(linkifyText("https://a.example.com と https://b.example.com")).toBe(
      '<a href="https://a.example.com" target="_blank" rel="noopener noreferrer">https://a.example.com</a> と <a href="https://b.example.com" target="_blank" rel="noopener noreferrer">https://b.example.com</a>',
    );
  });

  test("URL以外の部分に含まれるHTML特殊文字をエスケープする", () => {
    expect(linkifyText("<script>と&の説明 https://example.com/x")).toBe(
      '&lt;script&gt;と&amp;の説明 <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>',
    );
  });

  test("URL自体に含まれるクエリの & もエスケープする", () => {
    expect(linkifyText("https://example.com/?a=1&b=2")).toBe(
      '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">https://example.com/?a=1&amp;b=2</a>',
    );
  });

  test("http のみのスキームも変換する", () => {
    expect(linkifyText("http://example.com/legacy")).toBe(
      '<a href="http://example.com/legacy" target="_blank" rel="noopener noreferrer">http://example.com/legacy</a>',
    );
  });

  test("javascript: 等の非対応スキームはリンク化されない", () => {
    expect(linkifyText("javascript:alert(1) は無視される")).toBe(
      "javascript:alert(1) は無視される",
    );
  });

  test("空文字は空文字のまま", () => {
    expect(linkifyText("")).toBe("");
  });

  test("URL直後にスペースや区切り記号を挟まず日本語が続く場合、日本語部分はURLに含めない(#239)", () => {
    expect(linkifyText("詳しくはこちらhttps://example.com/pageをご覧ください")).toBe(
      '詳しくはこちら<a href="https://example.com/page" target="_blank" rel="noopener noreferrer">https://example.com/page</a>をご覧ください',
    );
  });

  test("URL直後にCJK記号(全角括弧等)が続く場合もURLに含めない(#239)", () => {
    expect(linkifyText("参考https://example.com/a【本文】")).toBe(
      '参考<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a>【本文】',
    );
  });

  test("末尾が省略記号「...」で切れた不完全なURLはリンク化しない", () => {
    // YouTube側の表示省略をそのままコピーしたと見られる、末尾が物理的に切れたURL。
    // ピリオドを句読点として除去して残りをリンク化すると、存在しないパスへの
    // 壊れたリンクになってしまうため、プレーンテキストのまま出力する。
    expect(linkifyText("愛用品はこちら https://www.marshall.com/jp/ja/produc... です")).toBe(
      "愛用品はこちら https://www.marshall.com/jp/ja/produc... です",
    );
  });

  test("末尾の単発のピリオド(通常の文末句点)は従来通り除去してリンク化する", () => {
    expect(linkifyText("詳細はhttps://example.com/a.")).toBe(
      '詳細は<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a>.',
    );
  });

  test("末尾がUnicode省略記号「…」で切れた不完全なURLはリンク化しない", () => {
    // 「...」(ピリオド3つ)と同様、YouTube側の表示省略がU+2026の一文字で
    // コピーされるケースもあるため、こちらもリンク化せずプレーンテキストのまま出力する。
    expect(linkifyText("愛用品はこちら https://www.marshall.com/jp/ja/produc… です")).toBe(
      "愛用品はこちら https://www.marshall.com/jp/ja/produc… です",
    );
  });
});
