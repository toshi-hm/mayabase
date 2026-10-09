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

  /** note(AI・フロントエンド技術の最新ニュースを発信するブログ) */
  note: {
    /** note のクリエイター名 */
    account: "maya_base",
    /** クリエイターページ URL */
    url: "https://note.com/maya_base",
    /** 導線で使う共通コピー(文言の二重管理を避けるため一箇所に集約) */
    cta: {
      eyebrow: "NOTE",
      title: "AI・フロントエンドの最新ニュースは note で",
      description:
        "動画では追いきれない最新トピックを、読みやすく整理してお届け。AIの新機能やフロントエンド技術の動向を、通勤時間や休憩中の数分でキャッチアップできます。",
      points: ["AIの最新ニュース", "フロントエンド技術の最新動向"],
      button: "noteを読む",
      /** 動画詳細など文脈の短い場所向けの一行コピー */
      short: "AI・フロントエンドの最新ニュースを note で発信中",
    },
  },

  /** 質問箱(マシュマロ)。動画概要欄に掲載している URL と同一 */
  marshmallow: {
    url: "https://marshmallow-qa.com/5grb3tbhads2ey9",
  },

  /** 愛用ガジェットページ関連の設定 */
  gear: {
    /** Amazon Storefront の URL(gear.astro 内の複数箇所から参照する単一の情報源) */
    storefrontUrl: "https://amzn.asia/d/07216xEl",
  },

  /** 運営者プロフィール(動画概要欄の公式プロフィールに基づく) */
  profile: {
    name: "Maya",
    image: "/images/profile.webp",
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

/**
 * チャンネル登録導線用の URL。
 * `sub_confirmation=1` を付与すると、遷移後に YouTube が登録確認ダイアログを自動表示する
 * (外部スクリプト埋め込み不要の公式仕様)。
 */
/**
 * note への導線 URL。流入元を note 側のアクセス解析で判別できるよう、
 * 設置箇所ごとの `utm_source` / `utm_medium` / `utm_campaign` を付与する。
 */
export function noteUrl(placement: string): string {
  const url = new URL(site.note.url);
  url.searchParams.set("utm_source", "mayabase");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", placement);
  return url.toString();
}

export function subscribeUrl(): string {
  return `${site.youtube.url}?sub_confirmation=1`;
}
