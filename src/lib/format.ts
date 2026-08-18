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
 * 表示用に再生回数を整形する(日本語表記)。
 * 1万以上は「○万回」(小数第1位、.0 は省略)、それ未満は3桁区切りの「○回」。
 * 例: 12345 → "1.2万回"、150000 → "15万回"、900 → "900回"(#35)
 */
export function formatViewCount(count: number): string {
  if (count >= 10_000) {
    const man = Math.round((count / 10_000) * 10) / 10;
    const label = Number.isInteger(man) ? man.toFixed(0) : man.toFixed(1);
    return `${label}万回`;
  }
  return `${count.toLocaleString("ja-JP")}回`;
}

/**
 * 動画概要欄から検索対象にすべき本文相当部分を取り出す。
 * 概要欄末尾は全動画共通の定型文(Profile・SNS・連絡先・使用ガジェット等)で、
 * いずれも "【" から始まる見出しを持つため、最初の "【" 以降を除外してノイズを減らす。
 * 該当箇所が無ければ全文をそのまま返す。
 * さらに概要欄冒頭には全動画共通の署名欄ハッシュタグ行(例: "#chatgpt #vlog #ai ..."）が
 * 置かれているため、これも検索対象から除外する(#79)。ハッシュタグでない冒頭行はそのまま残す。
 */
export function extractSearchableText(description: string): string {
  const boilerplateStart = description.indexOf("【");
  const body = boilerplateStart === -1 ? description : description.slice(0, boilerplateStart);
  const withoutLeadingHashtags = body.replace(/^(?:[ \t]*#\S+[ \t]*)+\n*/, "");
  return withoutLeadingHashtags.trim();
}

/** 正規表現メタ文字をエスケープする */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** HTML への挿入前に特殊文字をエスケープする(属性値・テキストノード両方で安全な最小限のセット) */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// CJK記号(U+3000-303F、全角スペース・【】「」等)・ひらがな(U+3040-309F)・カタカナ(U+30A0-30FF)・
// CJK統合漢字拡張A(U+3400-4DBF)・CJK統合漢字(U+4E00-9FFF)・全角/半角形(U+FF00-FFEF)は
// URL本体に現れ得ない文字として除外する。URL直後にスペースや改行を挟まず日本語の地の文が続く
// 概要欄でも、その日本語部分をURLとして巻き込まないようにするため(#239)。
const URL_PATTERN = /https?:\/\/[^\s<>"'　-〿぀-ヿ㐀-䶿一-鿿＀-￯]+/g;
// URL 末尾に付きがちな区切り記号は URL 本体から除外する(文末の句読点・括弧閉じ等が
// リンクに巻き込まれて意図しないURLになるのを防ぐ)。「…」(U+2026)も対象に含めるのは、
// 直後のピリオド連続判定と合わせて省略記号付きURLを検出するため。
const TRAILING_PUNCTUATION_PATTERN = /[)\].,、。」』】…]+$/;

/**
 * プレーンテキスト中の http(s) URL をアンカータグに変換する(動画概要欄の表示用)。
 * YouTube の概要欄という外部入力を `set:html` で挿入する前提のため、URL 以外の部分は
 * 必ず `escapeHtml` でエスケープしてから連結する(スキームは http(s) のみに限定しているため
 * javascript: 等の危険なスキームは URL として検出されない)。
 */
export function linkifyText(text: string): string {
  let result = "";
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const trailingMatch = rawUrl.match(TRAILING_PUNCTUATION_PATTERN);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    // 末尾に連続するピリオド(例:「...」)、または省略記号「…」(U+2026)を含む場合、
    // YouTube側の表示省略(長いURLの末尾が省略記号で切られたもの)をそのままコピーした
    // 不完全なURLである可能性が高い。通常の文末の句読点と同様に取り除いてリンク化すると、
    // 存在しないパスへの壊れたリンクになってしまうため、この場合はリンク化自体をスキップする。
    if (/\.\.+|…/.test(trailing)) continue;
    const url = trailing ? rawUrl.slice(0, rawUrl.length - trailing.length) : rawUrl;
    if (url === "") continue;

    result += escapeHtml(text.slice(lastIndex, start));
    const escapedUrl = escapeHtml(url);
    result += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedUrl}</a>`;
    result += escapeHtml(trailing);
    lastIndex = start + rawUrl.length;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * テキストにキーワードが含まれるか判定する(大文字小文字を区別しない)。
 * 英数字のみのキーワードは単語境界で照合する(例: "AI" が "iPad Air" の "Air" に
 * 誤マッチしないように)。日本語には単語境界の概念が適用できないため、
 * 日本語を含むキーワードは部分一致で照合する。
 * 全角英数字・半角カナ等は `normalize("NFKC")` で半角/全角の表記ゆれを吸収してから
 * 照合する(例: タイトル中の全角「１日」が半角キーワード「1日」で検索できるように・#241)。
 * `categories.ts` の動画自動分類・`videos.astro` のキーワード検索で共通して使う。
 */
export function textMatchesKeyword(text: string, keyword: string): boolean {
  if (keyword === "") return true;
  const normalizedText = text.normalize("NFKC");
  const normalizedKeyword = keyword.normalize("NFKC");
  if (/^[\x21-\x7e]+$/.test(normalizedKeyword)) {
    // `\b` はキーワード自身の先頭・末尾が単語構成文字([A-Za-z0-9_])であることを前提に
    // 境界を判定するため、"#chatgpt" や "C++" のように記号で始まる/終わるキーワードでは
    // 常に不一致になってしまう(#126)。前後読みでテキスト側の隣接文字が単語構成文字で
    // ないことを直接判定することで、キーワード自身の先頭・末尾の文字種に依存しないようにする。
    return new RegExp(
      `(?<![A-Za-z0-9_])${escapeRegExp(normalizedKeyword)}(?![A-Za-z0-9_])`,
      "i",
    ).test(normalizedText);
  }
  const lowerText = normalizedText.toLowerCase();
  const lowerKeyword = normalizedKeyword.toLowerCase();
  if (!/^[0-9]/.test(lowerKeyword)) {
    return lowerText.includes(lowerKeyword);
  }
  // 数字始まりの日本語混じりキーワード(例: "1日")は単語境界が使えないため部分一致に
  // 頼らざるを得ないが、そのままでは「31日」「21日」のような日付表記の末尾に
  // 偶然一致してしまう。直前の文字が数字でない出現(=数字の並びの一部ではない)
  // のみを一致とみなすことで、この種の誤マッチを避ける。
  let index = lowerText.indexOf(lowerKeyword);
  while (index !== -1) {
    const precedingChar = lowerText[index - 1];
    if (precedingChar === undefined || !/[0-9]/.test(precedingChar)) {
      return true;
    }
    index = lowerText.indexOf(lowerKeyword, index + 1);
  }
  return false;
}
