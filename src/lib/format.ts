const formatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** ISO 8601 の日時を「2026年7月11日」形式(日本時間)に整形する */
export function formatDateJa(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return formatter.format(new Date(time));
}

/** 表示用に本文を切り詰める(コードポイント単位、超過時は「…」を付与) */
export function truncate(text: string, maxLength: number): string {
  const chars = [...text];
  if (chars.length <= maxLength) return text;
  return `${chars.slice(0, maxLength).join("")}…`;
}

/**
 * 動画概要欄から検索対象にすべき本文相当部分を取り出す。
 * 概要欄末尾は全動画共通の定型文(Profile・SNS・連絡先・使用ガジェット等)で、
 * いずれも "【" から始まる見出しを持つため、最初の "【" 以降を除外してノイズを減らす。
 * 該当箇所が無ければ全文をそのまま返す。
 */
export function extractSearchableText(description: string): string {
  const boilerplateStart = description.indexOf("【");
  const body = boilerplateStart === -1 ? description : description.slice(0, boilerplateStart);
  return body.trim();
}
