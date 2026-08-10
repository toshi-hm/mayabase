import { textMatchesKeyword } from "./format";
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
 *
 * 「新卒」「大学院」は運営者の定番ブランディング語(「エンジニア×大学院生」の二足のわらじ)
 * として末尾ハッシュタグ含めほぼ全動画のタイトルに登場するため career の主判定には使わず、
 * vlog より後ろの弱いフォールバックとして扱う(#182)。career と確定させたい動画は
 * 「就活」「学位」「修了」「卒業」等、より特異度の高い語で判定する。
 */
const CATEGORY_KEYWORDS: readonly (readonly [VideoCategory, readonly string[]])[] = [
  ["career", ["就活", "キャリア", "学位", "修了", "卒業", "転職", "SIer", "勉強法", "非情報系"]],
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
      "フロアタイル",
    ],
  ],
  ["ai", ["AI", "ChatGPT", "GPT", "OpenAI", "Claude", "Gemini", "Copilot", "LLM"]],
  [
    "vlog",
    ["Vlog", "日常", "旅行", "ルーティン", "1日", "休日", "ライブ配信", "CDJ", "在宅勤務", "朝活"],
  ],
  // 弱いフォールバック(#182): 上記いずれにも該当しない場合のみ career 扱いにする
  ["career", ["新卒", "大学院"]],
];

/** タイトルから動画の主カテゴリを判定する。どれにも該当しなければ "other" */
export function categorizeVideo(video: Pick<Video, "title">): VideoCategory {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => textMatchesKeyword(video.title, keyword))) {
      return category;
    }
  }
  return "other";
}

/**
 * 動画が 1 件以上あるカテゴリだけを CATEGORY_ORDER の順序で返す。
 * `/videos/` のフィルタ UI と `/videos/category/{category}/` の静的ページ生成
 * (getStaticPaths)の双方で「0 件カテゴリは出さない」方針を単一の実装に集約する(#121)。
 */
export function getAvailableCategories(
  categorized: readonly { category: VideoCategory }[],
): VideoCategory[] {
  return CATEGORY_ORDER.filter((category) =>
    categorized.some((entry) => entry.category === category),
  );
}

/** カテゴリ別静的アーカイブページの URL(#121) */
export function categoryUrl(category: VideoCategory): string {
  return `/videos/category/${category}/`;
}

/**
 * 指定カテゴリの動画を再生回数の多い順(上位 `limit` 件)で返す。
 * 再生回数が未取得(null)の動画は videos.astro の並び替えロジックと同様に最下位扱いとし、
 * 結果として渡された配列内の元の順序(= videos.json の公開日時降順)が保たれる。
 * トップページの「気になるテーマは?」導線(#156)で使用する。
 */
export function topVideosByCategory(
  categorized: readonly { video: Video; category: VideoCategory }[],
  category: VideoCategory,
  limit: number,
): Video[] {
  return categorized
    .filter((entry) => entry.category === category)
    .map((entry) => entry.video)
    .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
    .slice(0, limit);
}
