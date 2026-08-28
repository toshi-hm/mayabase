import { parseChapters } from "./chapters";
import { textMatchesKeyword } from "./format";
import type { Video } from "./youtube";

/** チャプター横断検索の1件分(#280)。動画1件のチャプター1件に対応する。 */
export interface Topic {
  videoId: string;
  videoTitle: string;
  /** videoUrlAtTime の呼び出しに必要(Shorts は視聴 URL の形が異なるため) */
  isShort: boolean | null;
  /** チャプターの見出しラベル */
  label: string;
  /** チャプター開始位置(秒) */
  seconds: number;
}

/**
 * 全動画の概要欄からチャプター(parseChapters と同じ抽出・棄却ルール)を集約し、
 * サイト横断でキーワード検索できるフラットなリストに変換する(#280)。
 * 動画の並び順(videos.json の公開日時降順)・動画内のチャプター時系列順をそのまま維持する。
 */
export function buildTopicsIndex(videos: readonly Video[]): Topic[] {
  const topics: Topic[] = [];
  for (const video of videos) {
    for (const chapter of parseChapters(video.description)) {
      topics.push({
        videoId: video.id,
        videoTitle: video.title,
        isShort: video.isShort,
        label: chapter.label,
        seconds: chapter.seconds,
      });
    }
  }
  return topics;
}

/**
 * チャプター横断検索のキーワード照合(topics.astro のクライアントスクリプトから使用)。
 * チャプターの見出し・動画タイトルの両方を対象にする(glossary.ts の glossaryTextMatches と同方針)。
 */
export function topicTextMatches(label: string, videoTitle: string, query: string): boolean {
  return textMatchesKeyword(label, query) || textMatchesKeyword(videoTitle, query);
}
