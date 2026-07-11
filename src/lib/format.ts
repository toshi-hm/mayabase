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
