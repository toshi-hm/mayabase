import { describe, expect, test } from "bun:test";
import {
  extractAstroDisplayText,
  extractGlyphSource,
  stripCssComments,
  stripJsComments,
} from "./subset-fonts";

describe("stripJsComments", () => {
  test("行コメントを除去する", () => {
    const source = ["const a = 1; // これはコメントです", "const b = 2;"].join("\n");
    const result = stripJsComments(source);
    expect(result).not.toContain("これはコメントです");
    expect(result).toContain("const a = 1;");
    expect(result).toContain("const b = 2;");
  });

  test("ブロックコメント(JSDoc含む)を除去する", () => {
    const source = [
      "/**",
      " * サイト全体の設定コメント",
      " */",
      "const value = /* インライン */ 1;",
    ].join("\n");
    const result = stripJsComments(source);
    expect(result).not.toContain("サイト全体の設定コメント");
    expect(result).not.toContain("インライン");
    expect(result).toContain("const value =");
  });

  test("文字列リテラル内の // はコメントとして扱わない(URL を壊さない)", () => {
    const source = 'const url = "https://example.com/path";';
    const result = stripJsComments(source);
    expect(result).toBe(source);
  });

  test("文字列リテラル内の /* はコメントとして扱わない", () => {
    const source = 'const s = "value /* not a comment */ still string";';
    const result = stripJsComments(source);
    expect(result).toBe(source);
  });

  test("テンプレートリテラルの地の文はそのまま保持する", () => {
    const source = "const s = `表示テキスト https://example.com/// end`;";
    const result = stripJsComments(source);
    expect(result).toBe(source);
  });

  test("テンプレートリテラル内の展開式に含まれるコメントは除去する", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 検証対象は文字列内の ${ という並びそのもの
    const source = "const s = `前 ${/* 内部コメント */ value} 後`;";
    const result = stripJsComments(source);
    expect(result).not.toContain("内部コメント");
    expect(result).toContain("前 ${");
    expect(result).toContain("value} 後");
  });

  test("展開式内のオブジェクトリテラル({})でネストしても正しく閉じる", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 検証対象は文字列内の ${ という並びそのもの
    const source = "const s = `値: ${JSON.stringify({ a: 1, b: 2 })} 終わり`;";
    const result = stripJsComments(source);
    expect(result).toBe(source);
  });

  test("ネストしたテンプレートリテラルを扱える", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 検証対象は文字列内の ${ という並びそのもの
    const source = "const s = `外 ${`内 ${1 + 1} 内終`} 外終`;";
    const result = stripJsComments(source);
    expect(result).toBe(source);
  });

  test("エスケープされた引用符を正しく扱う", () => {
    const source = String.raw`const s = "it\'s \"quoted\"";`;
    const result = stripJsComments(source);
    expect(result).toBe(source);
  });

  test("コメントが無いコードはそのまま返す", () => {
    const source = 'export const label = "こんにちは";';
    expect(stripJsComments(source)).toBe(source);
  });
});

describe("stripCssComments", () => {
  test("ブロックコメントを除去し、通常のルールは残す", () => {
    const source = ["/* 見出しの装飾 */", ".title {", "  color: red;", "}"].join("\n");
    const result = stripCssComments(source);
    expect(result).not.toContain("見出しの装飾");
    expect(result).toContain(".title {");
    expect(result).toContain("color: red;");
  });

  test("行コメット記法(//)は CSS には存在しないため変更しない", () => {
    const source = ".a { content: 'x'; } // これは CSS では単なる文字の並び";
    expect(stripCssComments(source)).toBe(source);
  });
});

describe("extractAstroDisplayText", () => {
  test("フロントマターのコメントを除去し、import 文や表示用文字列は保持する", () => {
    const content = [
      "---",
      "// フロントマターのコメント: 開発者向けメモ",
      'import { site } from "../config/site";',
      "const title = site.name;",
      "---",
      "<h1>{title}</h1>",
    ].join("\n");
    const result = extractAstroDisplayText(content);
    expect(result).not.toContain("開発者向けメモ");
    expect(result).toContain("site.name");
    expect(result).toContain("<h1>{title}</h1>");
  });

  test("HTML コメントを除去する", () => {
    const content = [
      "---",
      "const x = 1;",
      "---",
      "<div>",
      "  <!-- ここはダークモード対応の注意書き -->",
      "  <p>表示テキスト</p>",
      "</div>",
    ].join("\n");
    const result = extractAstroDisplayText(content);
    expect(result).not.toContain("ここはダークモード対応の注意書き");
    expect(result).toContain("表示テキスト");
  });

  test("コメントのみの式ブロック({/* ... */})を除去する", () => {
    const content = [
      "---",
      "const x = 1;",
      "---",
      "<div>",
      "  {/* 見出し階層を保つための注釈 */}",
      "  <p>本文</p>",
      "</div>",
    ].join("\n");
    const result = extractAstroDisplayText(content);
    expect(result).not.toContain("見出し階層を保つための注釈");
    expect(result).toContain("本文");
  });

  test("<script> 内のコメントは除去し、コード・文字列は保持する", () => {
    const content = [
      "---",
      "const x = 1;",
      "---",
      "<div></div>",
      "<script>",
      "  // クリックイベントのハンドラ登録",
      '  const label = "クリックしてください";',
      "  console.log(label);",
      "</script>",
    ].join("\n");
    const result = extractAstroDisplayText(content);
    expect(result).not.toContain("クリックイベントのハンドラ登録");
    expect(result).toContain("クリックしてください");
  });

  test("<style> 内のコメントは除去し、CSS 自体は保持する", () => {
    const content = [
      "---",
      "const x = 1;",
      "---",
      "<div></div>",
      "<style>",
      "  /* ダークモードの上書き */",
      "  .box { color: red; }",
      "</style>",
    ].join("\n");
    const result = extractAstroDisplayText(content);
    expect(result).not.toContain("ダークモードの上書き");
    expect(result).toContain("color: red");
  });

  test("フロントマターが無いファイルでも例外を投げない", () => {
    const content = "<div>表示テキストのみ</div>";
    const result = extractAstroDisplayText(content);
    expect(result).toContain("表示テキストのみ");
  });
});

describe("extractGlyphSource", () => {
  test(".ts はコメントを除去する", () => {
    const content = '// 開発者向けコメント\nexport const label = "表示テキスト";';
    const result = extractGlyphSource("src/config/site.ts", content);
    expect(result).not.toContain("開発者向けコメント");
    expect(result).toContain("表示テキスト");
  });

  test(".css はブロックコメントを除去する", () => {
    const content = "/* コメント */\n.a { color: red; }";
    const result = extractGlyphSource("src/styles/global.css", content);
    expect(result).not.toContain("コメント");
  });

  test(".astro はフロントマター/HTML コメントを除去する", () => {
    const content = ["---", "// コメント", "const a = 1;", "---", "<p>表示</p>"].join("\n");
    const result = extractGlyphSource("src/pages/index.astro", content);
    expect(result).not.toContain("コメント");
    expect(result).toContain("表示");
  });

  test(".json はそのまま返す(コメントが存在し得ないため)", () => {
    const content = '{"title": "動画タイトル"}';
    const result = extractGlyphSource("src/data/videos.json", content);
    expect(result).toBe(content);
  });
});
