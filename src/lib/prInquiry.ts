/**
 * PR ページ(#603)の「ご相談時にお知らせいただきたいこと」と制作フロー。
 * 納期・掲載・肯定的評価を保証する表現は含めない。個人情報はページ上で入力させず、メールで送ってもらう。
 */

export const INQUIRY_ITEMS = [
  "企業名・ご担当者名",
  "製品/サービスの概要",
  "希望する動画形式",
  "希望公開時期",
  "提供/貸与の条件",
  "報酬の有無",
  "必須表記・訴求上のご要望",
  "公式製品URL",
] as const;

export interface FlowStep {
  title: string;
  description: string;
}

export const INQUIRY_FLOW: readonly FlowStep[] = [
  { title: "お問い合わせ", description: "メールで上記の内容をお送りください。" },
  { title: "内容確認・条件調整", description: "内容を確認し、条件についてご相談します。" },
  { title: "製品使用・検証", description: "実際に使用して検証します。" },
  { title: "制作", description: "動画を制作します。" },
  { title: "公開", description: "提供・広告関係を明示して公開します。" },
];

export const INQUIRY_DISCLAIMER =
  "お引き受けの可否・公開時期・動画内での評価はご相談内容によって異なり、事前にお約束するものではありません。案件の有無にかかわらず、良い点・気になった点の両方をレビューします。";

/** 初回メールに使えるテンプレート(コピー用の素のテキスト) */
export function buildInquiryTemplate(): string {
  return ["【PR・タイアップのご相談】", ...INQUIRY_ITEMS.map((item) => `■${item}:`)].join("\n");
}

/** メール作成時の件名の初期値(編集可能) */
export const INQUIRY_MAIL_SUBJECT = "【PR・タイアップ相談】企業名／製品名";

/**
 * 問い合わせ用 mailto: URL を組み立てる。宛先は呼び出し側(クライアント)で復元したアドレスを渡す。
 * 本文は buildInquiryTemplate() をそのまま使い、項目の二重管理を避ける。
 */
export function buildInquiryMailto(email: string): string {
  const query = [
    `subject=${encodeURIComponent(INQUIRY_MAIL_SUBJECT)}`,
    `body=${encodeURIComponent(buildInquiryTemplate())}`,
  ].join("&");
  return `mailto:${email}?${query}`;
}
