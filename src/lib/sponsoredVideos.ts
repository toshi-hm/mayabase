import type { Video } from "./youtube";

/** sponsored-videos.json の1件。運営者が手動でキュレーションする企業提供・タイアップ動画 */
export interface SponsoredVideoEntry {
  videoId: string;
  /** 提供元の表記。動画説明欄の「提供: ○○」と一致させる */
  sponsor: string;
  /** 公開情報に限った簡潔な紹介文 */
  summary: string;
}

export interface SponsoredVideosData {
  sponsoredVideos: SponsoredVideoEntry[];
}

export interface ResolvedSponsoredVideo extends SponsoredVideoEntry {
  video: Video;
}

/**
 * sponsored-videos.json を検証しつつパースする。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseSponsoredVideosData(data: unknown): SponsoredVideosData {
  if (typeof data !== "object" || data === null) {
    throw new Error("sponsored-videos.json: オブジェクトではありません");
  }
  const { sponsoredVideos } = data as { sponsoredVideos?: unknown };
  if (!Array.isArray(sponsoredVideos)) {
    throw new Error("sponsored-videos.json: sponsoredVideos は配列である必要があります");
  }
  const entries = sponsoredVideos.map((raw, i): SponsoredVideoEntry => {
    const e = (raw ?? {}) as Partial<Record<keyof SponsoredVideoEntry, unknown>>;
    for (const key of ["videoId", "sponsor", "summary"] as const) {
      if (typeof e[key] !== "string" || e[key].length === 0) {
        throw new Error(
          `sponsored-videos.json: [${i}].${key} は空でない文字列である必要があります`,
        );
      }
    }
    return {
      videoId: e.videoId as string,
      sponsor: e.sponsor as string,
      summary: e.summary as string,
    };
  });
  if (new Set(entries.map((e) => e.videoId)).size !== entries.length) {
    throw new Error("sponsored-videos.json: videoId に重複があります");
  }
  return { sponsoredVideos: entries };
}

/** 動画説明欄に「提供: ○○」(全角コロン可)の表記があるか */
export function hasSponsorNotice(video: Video, sponsor: string): boolean {
  const escaped = sponsor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`提供\\s*[:：]\\s*${escaped}`).test(video.description);
}

/**
 * 掲載順を維持して動画を解決する。
 * videos に存在しない動画(非公開・削除)や、説明欄に提供表記がない動画は黙ってスキップする
 * (未確認の提供表記を掲載しないため)。
 */
export function resolveSponsoredVideos(
  entries: readonly SponsoredVideoEntry[],
  videos: readonly Video[],
): ResolvedSponsoredVideo[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const resolved: ResolvedSponsoredVideo[] = [];
  for (const entry of entries) {
    const video = byId.get(entry.videoId);
    if (video && hasSponsorNotice(video, entry.sponsor)) resolved.push({ ...entry, video });
  }
  return resolved;
}
