import { XMLParser } from "fast-xml-parser";

/** note 記事 1 件分の表示用データ(/api/note-posts のレスポンス要素) */
export interface NotePost {
  title: string;
  /** 記事 URL(https://note.com/ 配下のみ) */
  url: string;
  /** ISO 8601 */
  publishedAt: string;
  /** サムネイル URL(note の画像ホストのみ)。無ければ null */
  thumbnail: string | null;
  /** 本文冒頭の抜粋(プレーンテキスト) */
  excerpt: string;
}

export const NOTE_RSS_URL = "https://note.com/maya_base/rss";
export const NOTE_POSTS_LIMIT = 4;
const EXCERPT_MAX_LENGTH = 90;

const ARTICLE_HOSTS = new Set(["note.com", "www.note.com"]);
const THUMBNAIL_HOSTS = new Set(["assets.st-note.com", "d2l930y2yx77uc.cloudfront.net"]);

function safeHttpsUrl(raw: unknown, allowedHosts: Set<string>): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** RSS の description(HTML)から「続きをみる」リンクを除いたプレーンテキストの抜粋を作る */
export function extractExcerpt(html: string, maxLength = EXCERPT_MAX_LENGTH): string {
  const plain = html
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...plain];
  return chars.length <= maxLength ? plain : `${chars.slice(0, maxLength).join("")}…`;
}

/**
 * note の RSS を新しい順に最大 limit 件へ整形する。
 * 外部入力なので、URL は note の正規ホストの https のみ許可し、不正な項目は読み飛ばす。
 */
export function parseNoteRss(xml: string, limit = NOTE_POSTS_LIMIT): NotePost[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "item",
  });
  const doc: unknown = parser.parse(xml);
  const items = (doc as { rss?: { channel?: { item?: unknown[] } } }).rss?.channel?.item;
  if (!items) return [];

  const posts: NotePost[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const title = text(item.title);
    const url = safeHttpsUrl(item.link, ARTICLE_HOSTS);
    const publishedMs = Date.parse(text(item.pubDate));
    if (!title || !url || Number.isNaN(publishedMs)) continue;
    posts.push({
      title,
      url,
      publishedAt: new Date(publishedMs).toISOString(),
      thumbnail: safeHttpsUrl(item["media:thumbnail"], THUMBNAIL_HOSTS),
      excerpt: extractExcerpt(text(item.description)),
    });
  }
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, limit);
}
