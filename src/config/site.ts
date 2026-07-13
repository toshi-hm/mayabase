/**
 * サイト全体の設定。
 * プロフィール文言・リンクはデプロイ前にここを編集してください。
 */
export const site = {
  /** サイト名 */
  name: "MayaBase",
  /** サイトの説明(meta description に使用) */
  description:
    "「ITで日常をより便利に」をテーマに、AI・ガジェット・社会人Vlogを発信する YouTube チャンネル「MayaBase」の公式ポータルサイト。最新動画・Shorts・X の投稿をまとめてチェックできます。",

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

  /** 質問箱(マシュマロ)。動画概要欄に掲載している URL と同一 */
  marshmallow: {
    url: "https://marshmallow-qa.com/5grb3tbhads2ey9",
  },

  /** お仕事依頼などの連絡先(スクレイピング対策で概要欄と同じ ☆ 表記) */
  contact: {
    emailObfuscated: "mayabaseofficial☆gmail.com(☆→@)",
  },

  /** 運営者プロフィール(動画概要欄の公式プロフィールに基づく) */
  profile: {
    name: "Maya",
    role: "ITメガベンチャー勤務 プランナー / 修士(人工知能科学)",
    bio: "新卒でITメガベンチャーにエンジニアとして入社すると同時に、国内大学院へストレートマスターとして入学。フロントエンドエンジニアとして開発を行う傍ら大学院でAIの学習・研究に励み、修士(人工知能科学)を取得。現在は同社でプランナーとして活躍中。「ITで日常をより便利に」をテーマに、AI・ガジェット・IoT家電のレビューや社会人のリアルな日常Vlogを発信しています。チャンネル登録・フォローお待ちしています!",
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
