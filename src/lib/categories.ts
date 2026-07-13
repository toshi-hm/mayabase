import type { Video } from "./youtube";

/**
 * 動画の主カテゴリ(1 動画 1 カテゴリ)。
 * videos.json には保存せず、ビルド時にタイトルから導出する(docs/03-content-expansion.md)。
 */
export type VideoCategory = "ai" | "gadget" | "vlog" | "career" | "other";

/** カテゴリの表示ラベル */
export const CATEGORY_LABELS: Record<VideoCategory, string> = {
  ai: "AI・テック",
  gadget: "ガジェット・家電",
  vlog: "Vlog・日常",
  career: "キャリア・学び",
  other: "その他",
};

/** フィルタ UI での表示順 */
export const CATEGORY_ORDER: readonly VideoCategory[] = ["ai", "gadget", "vlog", "career", "other"];

/**
 * カテゴリ判定キーワード。**判定順に意味がある**:
 * 特異度の高いカテゴリから照合する(例:「AI 大学院を卒業」は career、
 * 「買ってよかった◯◯で作る夜ご飯 Vlog」は vlog に落としたい)。
 * 概要欄は全動画に共通ハッシュタグ(#エンジニア #vlog 等)が付いており
 * 誤分類の原因になるため、照合対象はタイトルのみとする。
 * vlog の「1日」「休日」など一般語も含むため、分類が意図とズレた動画が出たら
 * ここのキーワードを見直すこと(categories.test.ts の実データ回帰テストで検知できる)。
 */
const CATEGORY_KEYWORDS: readonly (readonly [VideoCategory, readonly string[]])[] = [
  [
    "career",
    [
      "就活",
      "キャリア",
      "大学院",
      "学位",
      "修了",
      "卒業",
      "転職",
      "SIer",
      "勉強法",
      "新卒",
      "二足のわらじ",
      "非情報系",
    ],
  ],
  [
    "gadget",
    [
      "ガジェット",
      "家電",
      "購入品",
      "開封",
      "デスク環境",
      "ドッキングステーション",
      "キーボード",
      "イヤホン",
      "モニター",
      "iPad",
      "コーヒーメーカー",
      "体重計",
      "Amazon",
    ],
  ],
  ["ai", ["AI", "ChatGPT", "GPT", "OpenAI", "Claude", "Gemini", "Copilot", "LLM"]],
  ["vlog", ["Vlog", "日常", "旅行", "ルーティン", "1日", "休日", "ライブ配信", "CDJ"]],
];

/** 正規表現メタ文字をエスケープする */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * タイトルにキーワードが含まれるか(大文字小文字を区別しない)。
 * 英数字キーワードは単語境界で照合する(例: "AI" が "AirPods" に誤マッチしないように)。
 * 日本語には単語境界の概念が適用できないため部分一致で照合する。
 */
function matchesKeyword(title: string, keyword: string): boolean {
  if (/^[\x21-\x7e]+$/.test(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(title);
  }
  return title.includes(keyword);
}

/** タイトルから動画の主カテゴリを判定する。どれにも該当しなければ "other" */
export function categorizeVideo(video: Pick<Video, "title">): VideoCategory {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => matchesKeyword(video.title, keyword))) {
      return category;
    }
  }
  return "other";
}
