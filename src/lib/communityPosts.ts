/**
 * YouTube コミュニティ投稿(Posts)導線(#562)。
 * コミュニティ投稿を取得できる無料の公式APIが無いため、x-posts.json と同じ方針で
 * `src/data/community-posts.json` を一次ソースとする手動キュレーションで運用する。
 * Portal は視聴者向けサイトのため、公開済みの投稿のみを扱い、投稿予定・分析値・
 * 制作進捗など運営者向けの情報はこのデータ構造に含めない。
 */
import type { Video } from "./youtube";

/** コミュニティ投稿 1 件分 */
export interface CommunityPost {
  /** 投稿 ID(https://www.youtube.com/post/{id} の末尾) */
  id: string;
  /** 本文(表示用。長文は UI 側で切り詰める) */
  text: string;
  /** 投稿日時(ISO 8601) */
  date: string;
  /** この投稿が特定の動画に言及している場合、その動画 ID(Portal 内の詳細ページへも誘導する) */
  relatedVideoId?: string;
}

/** community-posts.json 全体の構造 */
export interface CommunityPostsData {
  posts: CommunityPost[];
}

const POST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_TEXT_LENGTH = 2000;

/** コミュニティ投稿の URL(YouTube公式の個別投稿URL形式) */
export function communityPostUrl(postId: string): string {
  return `https://www.youtube.com/post/${postId}`;
}

/**
 * community-posts.json の内容を検証しつつ読み込む。
 * 手動管理ファイルのため、形式ミスはビルド時に早期検出する(throw)。
 */
export function parseCommunityPostsData(data: unknown): CommunityPostsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("community-posts.json: オブジェクトではありません");
  }
  const { posts } = data as { posts?: unknown };
  if (!Array.isArray(posts)) {
    throw new Error("community-posts.json: posts は配列である必要があります");
  }
  const seenIds = new Set<string>();
  const parsed: CommunityPost[] = posts.map((raw, i) => {
    const post = raw as Partial<Record<keyof CommunityPost, unknown>>;
    if (typeof post.id !== "string" || !POST_ID_PATTERN.test(post.id)) {
      throw new Error(`community-posts.json: posts[${i}].id が不正です`);
    }
    if (seenIds.has(post.id)) {
      throw new Error(`community-posts.json: posts[${i}].id "${post.id}" が重複しています`);
    }
    seenIds.add(post.id);
    if (
      typeof post.text !== "string" ||
      post.text.trim().length === 0 ||
      post.text.length > MAX_TEXT_LENGTH
    ) {
      throw new Error(`community-posts.json: posts[${i}].text が不正です`);
    }
    if (typeof post.date !== "string" || Number.isNaN(Date.parse(post.date))) {
      throw new Error(`community-posts.json: posts[${i}].date は ISO 8601 形式で指定してください`);
    }
    if (post.relatedVideoId !== undefined && typeof post.relatedVideoId !== "string") {
      throw new Error(
        `community-posts.json: posts[${i}].relatedVideoId は文字列である必要があります`,
      );
    }
    return {
      id: post.id,
      text: post.text,
      date: post.date,
      ...(post.relatedVideoId !== undefined ? { relatedVideoId: post.relatedVideoId } : {}),
    };
  });
  // 新しい順に整列
  parsed.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return { posts: parsed };
}

/** relatedVideo を解決済みの投稿(トップページのカード描画に必要な最小限の情報のみ持つ) */
export interface ResolvedCommunityPost extends CommunityPost {
  relatedVideo: Pick<Video, "id" | "title" | "isShort"> | null;
}

/**
 * 各投稿の relatedVideoId を videos.json 由来の一覧から解決する。
 * 該当動画が存在しない(削除・非公開・入力ミス等)場合は null にし、
 * Portal 内の動画への導線だけを出さない(投稿自体は表示する)。
 */
export function resolveCommunityPosts(
  posts: readonly CommunityPost[],
  videos: readonly Video[],
): ResolvedCommunityPost[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  return posts.map((post) => ({
    ...post,
    relatedVideo: post.relatedVideoId ? (byId.get(post.relatedVideoId) ?? null) : null,
  }));
}
