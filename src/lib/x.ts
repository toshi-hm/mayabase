/** X(Twitter)ポスト 1 件分。src/data/x-posts.json で手動管理する */
export interface XPost {
  /** ポスト ID(status URL の末尾の数字) */
  id: string;
  /** 本文(表示用。長文は UI 側で切り詰める) */
  text: string;
  /** 投稿日時(ISO 8601) */
  date: string;
}

/** x-posts.json 全体の構造 */
export interface XPostsData {
  /** アカウント名(@ なし) */
  account: string;
  posts: XPost[];
}

/** ポストの URL */
export function postUrl(account: string, postId: string): string {
  return `https://x.com/${account}/status/${postId}`;
}

/**
 * x-posts.json の内容を検証しつつ読み込む。
 * 手動管理ファイルのため、形式ミスはビルド時に早期検出する(throw)。
 */
export function parseXPostsData(data: unknown): XPostsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("x-posts.json: オブジェクトではありません");
  }
  const { account, posts } = data as { account?: unknown; posts?: unknown };
  if (typeof account !== "string" || account === "" || account.startsWith("@")) {
    throw new Error("x-posts.json: account は @ なしのアカウント名を指定してください");
  }
  if (!Array.isArray(posts)) {
    throw new Error("x-posts.json: posts は配列である必要があります");
  }
  const parsed: XPost[] = posts.map((raw, i) => {
    const post = raw as { id?: unknown; text?: unknown; date?: unknown };
    if (typeof post.id !== "string" || !/^\d+$/.test(post.id)) {
      throw new Error(`x-posts.json: posts[${i}].id はポスト ID(数字列)を指定してください`);
    }
    if (typeof post.text !== "string" || post.text === "") {
      throw new Error(`x-posts.json: posts[${i}].text が空です`);
    }
    if (typeof post.date !== "string" || Number.isNaN(Date.parse(post.date))) {
      throw new Error(`x-posts.json: posts[${i}].date は ISO 8601 形式で指定してください`);
    }
    return { id: post.id, text: post.text, date: post.date };
  });
  // 新しい順に整列
  parsed.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return { account, posts: parsed };
}
