import { describe, expect, test } from "bun:test";
import type { FetchLike } from "../src/lib/youtube";
import { buildReport, probeVideo } from "./check-video-availability";

const video = { id: "abc123", title: "サンプル動画" };

describe("probeVideo", () => {
  test("oEmbedが2xxなら取得可能", async () => {
    const fetchFn: FetchLike = async () => new Response("{}", { status: 200 });
    expect((await probeVideo(video, fetchFn)).ok).toBe(true);
  });
  test("404は非公開・削除の可能性として異常にする", async () => {
    const fetchFn: FetchLike = async () => new Response(null, { status: 404 });
    expect(await probeVideo(video, fetchFn)).toMatchObject({ ok: false, status: 404 });
  });
  test("429を再試行して成功すれば取得可能とする", async () => {
    let calls = 0;
    const fetchFn: FetchLike = async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 429, headers: { "retry-after": "0" } })
        : new Response("{}", { status: 200 });
    };
    expect(await probeVideo(video, fetchFn)).toMatchObject({ ok: true, status: 200 });
    expect(calls).toBe(2);
  });
  test("ネットワーク失敗は取得失敗として記録する", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("timeout");
    };
    expect(await probeVideo(video, fetchFn)).toMatchObject({
      ok: false,
      status: null,
      error: "timeout",
    });
  });
});
describe("buildReport", () => {
  test("異常動画をまとめる", () => {
    const report = buildReport([video], [{ ...video, ok: false, status: 404, error: null }]);
    expect(report.unavailableCount).toBe(1);
    expect(report.summary).toContain("HTTP 404");
  });
});
