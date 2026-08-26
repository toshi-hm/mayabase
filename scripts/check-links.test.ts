import { describe, expect, test } from "bun:test";
import type { FaqData } from "../src/lib/faq";
import type { GearData } from "../src/lib/gear";
import type { FetchLike } from "../src/lib/youtube";
import {
  buildReport,
  collectLinkTargets,
  extractFaqLinks,
  extractGearLinks,
  type LinkProbeResult,
  type LinkTarget,
  probeLink,
} from "./check-links";

const gear: GearData = {
  items: [
    { name: "製品A", brand: "ブランドA", category: "desk", url: "https://amzn.to/aaa" },
    { name: "製品B", brand: "ブランドB", category: "studio", url: "https://example.com/b" },
  ],
};

const faq: FaqData = {
  categories: [
    {
      title: "カテゴリ1",
      items: [
        {
          question: "質問1",
          answer: "回答1",
          link: { label: "外部リンク", url: "https://example.com/faq-1" },
        },
        {
          question: "質問2",
          answer: "回答2",
          link: { label: "サイト内", url: "/videos/" },
        },
        {
          question: "質問3",
          answer: "回答3",
          // link 無し(email のみ等)は無視される
          email: "info☆example.com",
        },
      ],
    },
  ],
};

describe("extractGearLinks", () => {
  test("各アイテムの url を「ブランド 製品名」ラベル付きで抽出する", () => {
    expect(extractGearLinks(gear)).toEqual([
      { url: "https://amzn.to/aaa", source: "ブランドA 製品A" },
      { url: "https://example.com/b", source: "ブランドB 製品B" },
    ]);
  });

  test("items が空なら空配列", () => {
    expect(extractGearLinks({ items: [] })).toEqual([]);
  });
});

describe("extractFaqLinks", () => {
  test("外部リンク(https)のみ質問文ラベル付きで抽出し、サイト内パス・link 無しは除外する", () => {
    expect(extractFaqLinks(faq)).toEqual([{ url: "https://example.com/faq-1", source: "質問1" }]);
  });

  test("カテゴリ・items が空なら空配列", () => {
    expect(extractFaqLinks({ categories: [] })).toEqual([]);
  });
});

describe("collectLinkTargets", () => {
  test("gear.json と faq.json のリンクをまとめる", () => {
    const targets = collectLinkTargets(gear, faq);
    expect(targets).toEqual([
      { url: "https://amzn.to/aaa", sources: ["ブランドA 製品A"] },
      { url: "https://example.com/b", sources: ["ブランドB 製品B"] },
      { url: "https://example.com/faq-1", sources: ["質問1"] },
    ]);
  });

  test("同一 URL が複数箇所から参照される場合は 1 件にまとめ、参照元をすべて保持する", () => {
    const dup: GearData = {
      items: [
        { name: "製品A", brand: "ブランドA", category: "desk", url: "https://example.com/x" },
      ],
    };
    const dupFaq: FaqData = {
      categories: [
        {
          title: "カテゴリ1",
          items: [
            {
              question: "質問1",
              answer: "回答1",
              link: { label: "同じ商品", url: "https://example.com/x" },
            },
          ],
        },
      ],
    };
    expect(collectLinkTargets(dup, dupFaq)).toEqual([
      { url: "https://example.com/x", sources: ["ブランドA 製品A", "質問1"] },
    ]);
  });
});

describe("probeLink", () => {
  test("HEAD が 200 なら ok=true", async () => {
    const fetchFn: FetchLike = async () => new Response(null, { status: 200 });
    expect(await probeLink("https://example.com", fetchFn)).toEqual({
      ok: true,
      status: 200,
      error: null,
    });
  });

  test("HEAD が 404 なら ok=false でフォールバックしない", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      calls.push(init?.method ?? "GET");
      return new Response(null, { status: 404 });
    };
    expect(await probeLink("https://example.com", fetchFn)).toEqual({
      ok: false,
      status: 404,
      error: null,
    });
    expect(calls).toEqual(["HEAD"]);
  });

  test.each([405, 501])("HEAD が %d なら GET にフォールバックする", async (status) => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      calls.push(init?.method ?? "GET");
      return new Response(null, { status: calls.length === 1 ? status : 200 });
    };
    expect(await probeLink("https://example.com", fetchFn)).toEqual({
      ok: true,
      status: 200,
      error: null,
    });
    expect(calls).toEqual(["HEAD", "GET"]);
  });

  test("GET でも 405/501 なら ok=false(それ以上フォールバックしない)", async () => {
    const fetchFn: FetchLike = async () => new Response(null, { status: 501 });
    const result = await probeLink("https://example.com", fetchFn);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(501);
  });

  test("ネットワークエラーは ok=false・status=null・error にメッセージを保持する", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("network error");
    };
    expect(await probeLink("https://example.com", fetchFn)).toEqual({
      ok: false,
      status: null,
      error: "network error",
    });
  });
});

describe("buildReport", () => {
  const targets: LinkTarget[] = [
    { url: "https://example.com/ok", sources: ["OK商品"] },
    { url: "https://example.com/ng", sources: ["NG商品", "NG質問"] },
  ];

  test("すべて正常ならその旨のサマリを返す", () => {
    const results: LinkProbeResult[] = [
      { ok: true, status: 200, error: null },
      { ok: true, status: 200, error: null },
    ];
    const report = buildReport(targets, results);
    expect(report.totalCount).toBe(2);
    expect(report.brokenCount).toBe(0);
    expect(report.broken).toEqual([]);
    expect(report.summary).toBe("全 2 件の外部リンクは正常でした。");
  });

  test("異常があれば件数・詳細(URL・参照元・ステータス)を含むサマリを返す", () => {
    const results: LinkProbeResult[] = [
      { ok: true, status: 200, error: null },
      { ok: false, status: 404, error: null },
    ];
    const report = buildReport(targets, results);
    expect(report.brokenCount).toBe(1);
    expect(report.broken).toEqual([
      { url: "https://example.com/ng", sources: ["NG商品", "NG質問"], status: 404, error: null },
    ]);
    expect(report.summary).toContain("2 件中 1 件");
    expect(report.summary).toContain("https://example.com/ng");
    expect(report.summary).toContain("NG商品 / NG質問");
    expect(report.summary).toContain("HTTP 404");
  });

  test("ネットワークエラー(status=null)は「取得失敗」+エラーメッセージを含める", () => {
    const results: LinkProbeResult[] = [
      { ok: true, status: 200, error: null },
      { ok: false, status: null, error: "timeout" },
    ];
    const report = buildReport(targets, results);
    expect(report.summary).toContain("取得失敗(timeout)");
  });

  test("targets と results の件数が一致しない場合は throw する", () => {
    expect(() => buildReport(targets, [])).toThrow();
  });
});
