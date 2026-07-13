import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const FONT_PACKAGE = path.resolve("node_modules/@fontsource/line-seed-jp");
const OUTPUT_DIR = path.resolve("public/fonts");
const WEIGHTS = [400] as const;
const SOURCE_EXTENSIONS = new Set([".astro", ".css", ".json", ".ts"]);

const sourceFiles: string[] = [];
const glob = new Bun.Glob("**/*");

for await (const file of glob.scan({ cwd: "src", absolute: true, onlyFiles: true })) {
  if (SOURCE_EXTENSIONS.has(path.extname(file))) sourceFiles.push(file);
}

const sourceText = await Promise.all(
  sourceFiles.sort().map(async (file) => await Bun.file(file).text()),
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
      "fonttools[woff]",
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
