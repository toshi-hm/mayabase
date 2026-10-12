import { categorizeVideo, type VideoCategory } from "./categories";
import type { Video } from "./youtube";

/** 再生回数が取得済みの動画(代表実績の並び替えに必須) */
export type ViewCountedVideo = Video & { viewCount: number };

/**
 * PR ページ(#577)の代表実績で優先する「商品・サービスレビュー系」カテゴリ。
 * 固定の動画 ID ではなく、既存のカテゴリ判定(categorizeVideo)に基づいて選定する(#416 の再発防止)。
 */
export const REVIEW_CATEGORIES: readonly VideoCategory[] = ["gadget", "ai"];

/** レビュー系が足りないときのフォールバック順(キャリア系は最後) */
const FALLBACK_CATEGORIES: readonly VideoCategory[] = ["vlog", "other", "career"];

function byViewCountDesc(a: ViewCountedVideo, b: ViewCountedVideo): number {
  return b.viewCount - a.viewCount;
}

/**
 * PR ページの代表動画を選ぶ。
 * 1. 再生回数が取得済みの動画のみ対象(非公開・削除で videos.json から消えた動画は自然に除外される)
 * 2. レビュー系カテゴリ(ガジェット・AI)を優先し、カテゴリ間で交互に取り出してジャンルの偏りを避ける
 * 3. 長尺動画を優先し、Shorts は長尺で枠が埋まらない場合のみ使う
 * 4. それでも `limit` に満たなければ Vlog・その他・キャリアの順で再生回数の多い動画で補う
 */
export function pickRepresentativeVideos(videos: readonly Video[], limit: number): Video[] {
  if (limit <= 0) return [];
  const counted = videos
    .filter((v): v is ViewCountedVideo => v.viewCount !== null)
    .map((video) => ({ video, category: categorizeVideo(video) }));

  const picked: ViewCountedVideo[] = [];
  const takenIds = new Set<string>();
  const take = (video: ViewCountedVideo) => {
    picked.push(video);
    takenIds.add(video.id);
  };
  const pool = (categories: readonly VideoCategory[], allowShort: boolean) =>
    categories.map((category) =>
      counted
        .filter(
          (e) =>
            e.category === category &&
            !takenIds.has(e.video.id) &&
            (allowShort || e.video.isShort !== true),
        )
        .map((e) => e.video)
        .sort(byViewCountDesc),
    );

  for (const allowShort of [false, true]) {
    // カテゴリごとの候補を交互に 1 本ずつ取り出す
    const queues = pool(REVIEW_CATEGORIES, allowShort);
    while (picked.length < limit && queues.some((q) => q.length > 0)) {
      for (const queue of queues) {
        const next = queue.shift();
        if (next && picked.length < limit) take(next);
      }
    }
  }

  for (const allowShort of [false, true]) {
    for (const category of FALLBACK_CATEGORIES) {
      if (picked.length >= limit) break;
      for (const video of pool([category], allowShort)[0] ?? []) {
        if (picked.length >= limit) break;
        take(video);
      }
    }
  }
  return picked;
}
