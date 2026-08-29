/**
 * wrangler.jsonc がそのままデプロイ可能な状態であることを守る回帰テスト。
 *
 * 背景: kv_namespaces[].id にプレースホルダ("REPLACE_WITH_KV_NAMESPACE_ID")を
 * コミットしてしまい、Cloudflare のビルドが
 * 「KV namespace '...' is not valid [code: 10042]」で失敗してサイト全体のデプロイが
 * 止まったことがある。CI(bun test)で同じ事故を検知する。
 */
import { describe, expect, test } from "bun:test";

/** 文字列リテラルを壊さずに、JSONC の行コメントとブロックコメントを取り除く */
function stripJsonComments(source: string): string {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        out += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    out += char;
  }

  return out;
}

interface WranglerConfig {
  name?: string;
  main?: string;
  assets?: { directory?: string; binding?: string };
  kv_namespaces?: { binding?: string; id?: string }[];
}

const raw = await Bun.file(new URL("../wrangler.jsonc", import.meta.url)).text();
const config = JSON.parse(stripJsonComments(raw)) as WranglerConfig;

describe("wrangler.jsonc", () => {
  test("コメントを除去すると有効なJSONとしてパースできる", () => {
    expect(config.name).toBe("portal");
    expect(config.main).toBe("worker/index.ts");
    expect(config.assets?.binding).toBe("ASSETS");
  });

  test("プレースホルダのままのIDが含まれていない", () => {
    for (const namespace of config.kv_namespaces ?? []) {
      expect(namespace.id ?? "").not.toMatch(/REPLACE_WITH|<|>|TODO|XXX/i);
    }
  });

  test("kv_namespaces を設定する場合、IDはCloudflareが払い出す32桁の16進数である", () => {
    for (const namespace of config.kv_namespaces ?? []) {
      expect(namespace.binding).toBe("PUSH_SUBSCRIPTIONS");
      expect(namespace.id ?? "").toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
