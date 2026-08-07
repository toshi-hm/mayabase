import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import { formatChapterTime, parseChapters } from "./chapters";
import { parseVideosData } from "./youtube";

describe("parseChapters", () => {
  test("0:00 始まり・3件以上・昇順ならチャプターとして抽出する", () => {
    const description = [
      "今日は在宅勤務のvlogです。",
      "",
      "0:00 オープニング",
      "1:23 朝の準備",
      "5:10 ランチタイム",
      "",
      "【プロフィール】",
    ].join("\n");
    expect(parseChapters(description)).toEqual([
      { seconds: 0, label: "オープニング" },
      { seconds: 83, label: "朝の準備" },
      { seconds: 310, label: "ランチタイム" },
    ]);
  });

  test("HH:MM:SS 形式にも対応する", () => {
    const description = ["0:00 導入", "10:00 本編", "1:05:30 まとめ"].join("\n");
    expect(parseChapters(description)).toEqual([
      { seconds: 0, label: "導入" },
      { seconds: 600, label: "本編" },
      { seconds: 3930, label: "まとめ" },
    ]);
  });

  test("2件以下(YouTube の最小件数未満)なら空配列を返す", () => {
    const description = ["0:00 導入", "1:00 本編"].join("\n");
    expect(parseChapters(description)).toEqual([]);
  });

  test("チャプター記法を含まない概要欄は空配列を返す", () => {
    expect(parseChapters("いつもご視聴ありがとうございます。\n#vlog #ai")).toEqual([]);
  });

  test("最初のチャプターが 0:00 から離れすぎている場合は空配列を返す(誤検知防止)", () => {
    const description = ["1:00 導入", "5:00 本編", "10:00 まとめ"].join("\n");
    expect(parseChapters(description)).toEqual([]);
  });

  test("昇順でない場合は空配列を返す(時刻に見える無関係な行への誤検知防止)", () => {
    const description = ["0:00 導入", "5:00 本編", "3:00 まとめ"].join("\n");
    expect(parseChapters(description)).toEqual([]);
  });

  test("時刻が同一で増加しない行を含む場合は空配列を返す", () => {
    const description = ["0:00 導入", "5:00 本編", "5:00 まとめ"].join("\n");
    expect(parseChapters(description)).toEqual([]);
  });

  test("行頭以外に現れる時刻表記らしき文字列には反応しない", () => {
    const description = ["撮影時間は 0:00 から 5:00 くらいでした。次回もお楽しみに。"].join("\n");
    expect(parseChapters(description)).toEqual([]);
  });

  test("実データ: チャプター記法を含む動画のみ 3 件以上・昇順で抽出できる(回帰テスト)", () => {
    const { videos } = parseVideosData(videosJson);
    expect(videos.length).toBeGreaterThan(0);
    let videosWithChapters = 0;
    for (const video of videos) {
      const chapters = parseChapters(video.description);
      if (chapters.length === 0) continue;
      videosWithChapters++;
      expect(chapters.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < chapters.length; i++) {
        const current = chapters[i];
        const previous = chapters[i - 1];
        expect(current).toBeDefined();
        expect(previous).toBeDefined();
        if (current && previous) {
          expect(current.seconds).toBeGreaterThan(previous.seconds);
        }
      }
    }
    // 実データに複数のチャプター付き動画が存在することを確認(実装が空振りしていないことの担保)
    expect(videosWithChapters).toBeGreaterThan(0);
  });
});

describe("formatChapterTime", () => {
  test("1時間未満は m:ss 形式", () => {
    expect(formatChapterTime(0)).toBe("0:00");
    expect(formatChapterTime(83)).toBe("1:23");
    expect(formatChapterTime(599)).toBe("9:59");
  });

  test("1時間以上は h:mm:ss 形式", () => {
    expect(formatChapterTime(3600)).toBe("1:00:00");
    expect(formatChapterTime(3930)).toBe("1:05:30");
  });
});
