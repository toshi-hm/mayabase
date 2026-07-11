/**
 * サイト全体の設定。
 * プロフィール文言・リンクはデプロイ前にここを編集してください。
 */
export const site = {
  /** サイト名 */
  name: "MayaBase",
  /** サイトの説明(meta description に使用) */
  description:
    "YouTube チャンネル「MayaBase」の公式ポータルサイト。最新動画・Shorts・X の投稿をまとめてチェックできます。",

  youtube: {
    /** チャンネルハンドル */
    handle: "@maya_base",
    /** チャンネル URL */
    url: "https://youtube.com/@maya_base",
    /**
     * チャンネル ID(UC で始まる不変値)。
     * 設定しておくとビルド時のハンドル解決をスキップできます(推奨)。
     * YouTube Studio → 設定 → チャンネル → 詳細設定 で確認できます。
     * ここだけ任意の文字列が代入される前提のため、意図的に string へ widening しています。
     */
    channelId: "UC3ELUpDyBSGZfZJib67t4Sg" as string,
  },

  x: {
    /** X(Twitter)アカウント名(@ なし) */
    account: "MayaBaseJP",
    /** プロフィール URL */
    url: "https://x.com/MayaBaseJP",
  },

  /** 運営者プロフィール(要編集) */
  profile: {
    name: "Maya",
    role: "MayaBase チャンネル運営者",
    bio: "YouTube チャンネル「MayaBase」を運営しています。動画と Shorts を中心に、日々コンテンツを発信中。チャンネル登録・フォローお待ちしています!",
  },

  /** カルーセルの表示設定 */
  carousel: {
    /** 自動切替の間隔(ミリ秒) */
    autoplayDelayMs: 5000,
    /** 各セクションの最大表示件数 */
    maxItems: 6,
  },
} as const;

export type SiteConfig = typeof site;
