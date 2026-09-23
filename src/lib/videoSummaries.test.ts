import { describe, expect, test } from "bun:test";
import { getVideoSummary, parseVideoSummariesData } from "./videoSummaries";

const points = ["要点1", "要点2", "要点3"];

describe("parseVideoSummariesData", () => {
  test("動画IDごとの要点配列をパースする", () => {
    expect(parseVideoSummariesData({ summaries: { abc123def45: points } })).toEqual({
      summaries: { abc123def45: points },
    });
  });

  test("空データと動画ごとの取得を許容する", () => {
    const data = parseVideoSummariesData({ summaries: {} });
    expect(getVideoSummary(data, { id: "missing" })).toBeNull();
  });

  test("該当動画の要点があれば配列を返す", () => {
    const data = parseVideoSummariesData({ summaries: { abc123def45: points } });
    expect(getVideoSummary(data, { id: "abc123def45" })).toEqual(points);
  });

  test("ID・要点を検証する", () => {
    expect(() => parseVideoSummariesData(null)).toThrow("オブジェクト");
    expect(() => parseVideoSummariesData({ summaries: [] })).toThrow("オブジェクト");
    expect(() => parseVideoSummariesData({ summaries: { "bad id": points } })).toThrow("動画ID");
    expect(() => parseVideoSummariesData({ summaries: { abc123def45: [] } })).toThrow("要点");
    expect(() => parseVideoSummariesData({ summaries: { abc123def45: ["", "b", "c"] } })).toThrow(
      "要点",
    );
    expect(() => parseVideoSummariesData({ summaries: { abc123def45: [1, 2, 3] } })).toThrow(
      "要点",
    );
    expect(() =>
      parseVideoSummariesData({
        summaries: { abc123def45: ["a", "b", "c", "d", "e", "f"] },
      }),
    ).toThrow("要点");
    expect(() =>
      parseVideoSummariesData({
        summaries: { abc123def45: ["あ".repeat(81)] },
      }),
    ).toThrow("要点");
  });
});
