import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const FONT_PACKAGE = path.resolve("node_modules/@fontsource/line-seed-jp");
const OUTPUT_DIR = path.resolve("public/fonts");
const WEIGHTS = [400] as const;
const SOURCE_EXTENSIONS = new Set([".astro", ".css", ".json", ".ts"]);
// fonttools はバージョンを固定する。未固定だと `uvx` が実行時点の最新版を解決するため、
// 同じ文字集合でも生成環境・実行時期によって出力バイナリが変わり得る
// (CIの最新性チェック(#58)が誤って差分ありと判定してしまう)。
const FONTTOOLS_SPEC = "fonttools[woff]==4.63.0";

/**
 * JS/TS ソース文字列からコメント(`//` 行コメントおよびブロックコメント)を除去する。
 * 文字列リテラル・テンプレートリテラル(`${}` 式のネスト込み)の中身はコメント記号に
 * 見える並び(例: URL 中の `//`)であってもコメントとして誤検出しないよう、引用符の
 * 対応を追跡しながら走査する(#236: コメント専用の文字がサブセットフォントに混入し
 * 配信フォントを不必要に肥大化させていた問題への対応)。
 *
 * 制限: 正規表現リテラルは特別扱いしていないため、リテラル内にブロックコメント開始に
 * 見える並びがあると誤ってブロックコメント扱いされ得る。本リポジトリのソースには
 * 該当パターンが無いことを確認済みだが、将来そのようなリテラルを追加する場合は注意すること。
 */
export function stripJsComments(source: string): string {
  type Frame = { kind: "template" } | { kind: "expr"; depth: number };
  const stack: Frame[] = [];
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const top = stack[stack.length - 1];

    if (top?.kind === "template") {
      const ch = source[i];
      if (ch === "\\") {
        out += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === "`") {
        out += ch;
        stack.pop();
        i += 1;
        continue;
      }
      if (ch === "$" && source[i + 1] === "{") {
        out += "${";
        stack.push({ kind: "expr", depth: 1 });
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      i += 2;
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, n);
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        i += 1;
      }
      if (i < n) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    if (ch === "`") {
      out += ch;
      stack.push({ kind: "template" });
      i += 1;
      continue;
    }
    if (top?.kind === "expr") {
      if (ch === "{") {
        top.depth += 1;
      } else if (ch === "}") {
        top.depth -= 1;
        if (top.depth === 0) {
          out += ch;
          stack.pop();
          i += 1;
          continue;
        }
      }
    }
    out += ch;
    i += 1;
  }

  return out;
}

/** CSS ソース文字列からブロックコメントを除去する。CSS に行コメントは無い。 */
export function stripCssComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, n);
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

/**
 * Astro ファイル(フロントマター + テンプレート)から、実際に画面へ描画され得るテキスト
 * のみを抽出する。
 * - フロントマター(先頭の `---`〜`---`)は TS コードとして {@link stripJsComments} を適用する。
 * - `<script>` タグの中身はクライアント側 JS のため同様に {@link stripJsComments} を適用する。
 * - `<style>` タグの中身は CSS のため {@link stripCssComments} を適用する。
 * - 残りのテンプレート部分は HTML コメント(`<!-- -->`)と、コメントのみで構成される
 *   式ブロック(中身が JS ブロックコメントだけの `{ ... }`)を取り除く。テンプレート内の
 *   `{jsExpr}` はそれ自体が表示用データの組み立てロジックであり得るため、一律には除去
 *   しない(過剰除去による表示崩れを避けるための保守的な方針)。
 */
export function extractAstroDisplayText(content: string): string {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : "";
  let template = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;

  let scriptText = "";
  template = template.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_match, body: string) => {
    scriptText += stripJsComments(body);
    return "";
  });

  let styleText = "";
  template = template.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, body: string) => {
    styleText += stripCssComments(body);
    return "";
  });

  template = template.replace(/<!--[\s\S]*?-->/g, "");
  template = template.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

  return stripJsComments(frontmatter) + scriptText + styleText + template;
}

/**
 * 1 ファイル分の内容から、フォントサブセットの文字収集対象となるテキストを抽出する。
 * 拡張子ごとに、非表示テキスト(コメント等)を可能な範囲で除外する。
 */
export function extractGlyphSource(filePath: string, content: string): string {
  switch (path.extname(filePath)) {
    case ".ts":
      return stripJsComments(content);
    case ".css":
      return stripCssComments(content);
    case ".astro":
      return extractAstroDisplayText(content);
    default:
      // .json はコメントを持ち得ないため、そのまま対象にする。
      return content;
  }
}

async function main() {
  const sourceFiles: string[] = [];
  const glob = new Bun.Glob("**/*");

  for await (const file of glob.scan({ cwd: "src", absolute: true, onlyFiles: true })) {
    if (SOURCE_EXTENSIONS.has(path.extname(file)) && !file.endsWith(".test.ts")) {
      sourceFiles.push(file);
    }
  }

  const sourceText = await Promise.all(
    sourceFiles.sort().map(async (file) => extractGlyphSource(file, await Bun.file(file).text())),
  );
  const glyphs = [...new Set(sourceText.join(""))].sort().join("");

  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const weight of WEIGHTS) {
    const input = path.join(FONT_PACKAGE, "files", `line-seed-jp-japanese-${weight}-normal.woff2`);
    const output = path.join(OUTPUT_DIR, `line-seed-jp-${weight}-subset.woff2`);
    const process = Bun.spawn(
      [
        "uvx",
        "--from",
        FONTTOOLS_SPEC,
        "pyftsubset",
        input,
        `--output-file=${output}`,
        "--flavor=woff2",
        `--text=${glyphs}`,
        "--layout-features=*",
        "--no-hinting",
      ],
      { stdout: "inherit", stderr: "inherit" },
    );

    if ((await process.exited) !== 0) throw new Error(`Failed to subset LINE Seed JP ${weight}`);
  }

  await copyFile(path.join(FONT_PACKAGE, "LICENSE"), path.join(OUTPUT_DIR, "OFL.txt"));

  console.log(`Generated ${WEIGHTS.length} LINE Seed JP subsets with ${glyphs.length} glyphs.`);
}

if (import.meta.main) {
  await main();
}
