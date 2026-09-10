import { describe, expect, test } from "bun:test";
import { getTranscript, parseTranscriptsData } from "./transcripts";

const valid = { text: "字幕の本文です。", language: "ja" };

describe("parseTranscriptsData", () => {
  test("動画IDごとの字幕をパースする", () => {
    expect(parseTranscriptsData({ transcripts: { abc123def45: valid } })).toEqual({
      transcripts: { abc123def45: valid },
    });
  });
  test("空データと動画ごとの取得を許容する", () => {
    const data = parseTranscriptsData({ transcripts: {} });
    expect(getTranscript(data, { id: "missing" })).toBeNull();
  });
  test("ID・本文・言語を検証する", () => {
    expect(() => parseTranscriptsData(null)).toThrow("オブジェクト");
    expect(() => parseTranscriptsData({ transcripts: [] })).toThrow("オブジェクト");
    expect(() => parseTranscriptsData({ transcripts: { "bad id": valid } })).toThrow("動画ID");
    expect(() =>
      parseTranscriptsData({ transcripts: { abc123def45: { ...valid, text: "" } } }),
    ).toThrow("text");
    expect(() =>
      parseTranscriptsData({ transcripts: { abc123def45: { ...valid, language: "" } } }),
    ).toThrow("language");
    expect(() => parseTranscriptsData({ transcripts: { "short-id": valid } })).toThrow("動画ID");
    expect(() =>
      parseTranscriptsData({
        transcripts: { abc123def45: { ...valid, language: "not a language" } },
      }),
    ).toThrow("language");
    expect(
      parseTranscriptsData({ transcripts: { abc123def45: { ...valid, language: "en-US" } } }),
    ).toEqual({ transcripts: { abc123def45: { ...valid, language: "en-US" } } });
  });
});
