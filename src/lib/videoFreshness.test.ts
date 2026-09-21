import { describe, expect, test } from "bun:test";
import {
  findAiFreshnessNoticeVideo,
  findNewerVideoInSameCategory,
  isStaleAiVideo,
} from "./videoFreshness";
import type { Video } from "./youtube";

// カテゴリ判定はタイトルに依存する(categorizeVideo)ため、テスト用動画のタイトルは
// 意図したカテゴリに確実に判定されるキーワードを含める(relatedVideos.test.ts と同じ方針)。
const video = (id: string, title: string, publishedAt: string): Video => ({
  id,
  title,
  description: "",
  publishedAt,
  isShort: false,
  viewCount: null,
  duration: null,
});

const NOW = new Date("2026-09-21T00:00:00+09:00");

describe("isStaleAiVideo", () => {
  test("AIカテゴリかつ12ヶ月以上経過していれば true", () => {
    const target = video("target", "ChatGPT の新機能を試す", "2025-06-01T00:00:00+09:00");
    expect(isStaleAiVideo(target, NOW)).toBe(true);
  });

  test("AIカテゴリでも12ヶ月未満なら false", () => {
    const target = video("target", "ChatGPT の新機能を試す", "2026-06-01T00:00:00+09:00");
    expect(isStaleAiVideo(target, NOW)).toBe(false);
  });

  test("AI以外のカテゴリは経過期間に関わらず false", () => {
    const target = video("target", "【平日Vlog】在宅勤務の1日", "2020-01-01T00:00:00+09:00");
    expect(isStaleAiVideo(target, NOW)).toBe(false);
  });

  test("不正なpublishedAtは false", () => {
    const target = video("target", "ChatGPT の新機能を試す", "not-a-date");
    expect(isStaleAiVideo(target, NOW)).toBe(false);
  });

  describe("12ヶ月の境界値", () => {
    test("ちょうど12ヶ月経過(閾値以上)は true", () => {
      const target = video("target", "ChatGPT の新機能を試す", "2025-09-21T00:00:00+09:00");
      expect(isStaleAiVideo(target, NOW)).toBe(true);
    });

    test("12ヶ月経過の1日前(閾値未満)は false", () => {
      const target = video("target", "ChatGPT の新機能を試す", "2025-09-22T00:00:00+09:00");
      expect(isStaleAiVideo(target, NOW)).toBe(false);
    });

    test("12ヶ月経過の1日後(閾値超過)は true", () => {
      const target = video("target", "ChatGPT の新機能を試す", "2025-09-20T00:00:00+09:00");
      expect(isStaleAiVideo(target, NOW)).toBe(true);
    });
  });
});

describe("findNewerVideoInSameCategory", () => {
  const target = video("target", "ChatGPT の新機能を試す", "2025-06-01T00:00:00+09:00");
  const newer = video("newer", "GPT-5 レビュー", "2026-01-01T00:00:00+09:00");
  const evenNewer = video("even-newer", "Gemini の使い方", "2026-07-01T00:00:00+09:00");
  const older = video("older", "OpenAI の新発表", "2024-01-01T00:00:00+09:00");
  const otherCategory = video("other", "【平日Vlog】在宅勤務の1日", "2026-06-15T00:00:00+09:00");

  test("同カテゴリでより新しい動画のうち最新の1本を返す", () => {
    const result = findNewerVideoInSameCategory(target, [
      target,
      newer,
      evenNewer,
      older,
      otherCategory,
    ]);
    expect(result?.id).toBe("even-newer");
  });

  test("より新しい同カテゴリ動画が無ければ null", () => {
    const result = findNewerVideoInSameCategory(target, [target, older, otherCategory]);
    expect(result).toBeNull();
  });

  test("自分自身は候補に含めない", () => {
    const result = findNewerVideoInSameCategory(target, [target]);
    expect(result).toBeNull();
  });
});

describe("findAiFreshnessNoticeVideo", () => {
  test("古いAI系動画でより新しい同カテゴリ動画があればそれを返す", () => {
    const target = video("target", "ChatGPT の新機能を試す", "2025-06-01T00:00:00+09:00");
    const newer = video("newer", "GPT-5 レビュー", "2026-01-01T00:00:00+09:00");
    const result = findAiFreshnessNoticeVideo(target, [target, newer], NOW);
    expect(result?.id).toBe("newer");
  });

  test("古いAI系動画でも同カテゴリのより新しい動画が無ければ null(セクション非表示)", () => {
    const target = video("target", "ChatGPT の新機能を試す", "2025-06-01T00:00:00+09:00");
    const older = video("older", "OpenAI の新発表", "2024-01-01T00:00:00+09:00");
    const result = findAiFreshnessNoticeVideo(target, [target, older], NOW);
    expect(result).toBeNull();
  });

  test("AI系でもまだ12ヶ月経っていなければ null(新しい動画があっても出さない)", () => {
    const target = video("target", "ChatGPT の新機能を試す", "2026-06-01T00:00:00+09:00");
    const newer = video("newer", "GPT-5 レビュー", "2026-08-01T00:00:00+09:00");
    const result = findAiFreshnessNoticeVideo(target, [target, newer], NOW);
    expect(result).toBeNull();
  });

  test("AI以外のカテゴリは古くても null", () => {
    const target = video("target", "【平日Vlog】在宅勤務の1日", "2020-01-01T00:00:00+09:00");
    const newer = video("newer", "週末ルーティンVlog", "2026-01-01T00:00:00+09:00");
    const result = findAiFreshnessNoticeVideo(target, [target, newer], NOW);
    expect(result).toBeNull();
  });
});
