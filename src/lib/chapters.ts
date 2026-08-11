/** 動画のチャプター(目次)1件分 */
export interface Chapter {
  /** チャプター開始位置(秒) */
  seconds: number;
  /** チャプターの見出しテキスト */
  label: string;
}

// "0:00 導入" / "1:23:45 まとめ" のような行に一致する(呼び出し側で trim 済みの行を渡す前提)
const CHAPTER_LINE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+)$/;

/** YouTube 公式がチャプター表示の条件とする最小件数 */
const MIN_CHAPTERS = 3;
/**
 * 最初のチャプターが 0:00 からどれだけ離れていても許容するか(秒)。
 * オープニング挨拶等で数十秒ずれるチャプター動画は珍しくないため、
 * 「概ね冒頭」とみなせる範囲まで許容する(#195)。
 */
const MAX_START_OFFSET_SECONDS = 20;

/**
 * 動画概要欄からチャプター(目次)を抽出する。
 * YouTube 公式のチャプター認識条件(先頭が概ね 0:00・3件以上・昇順)を踏襲し、
 * 条件を満たさない場合は「チャプターなし」として空配列を返す(誤検知の防止を優先する)。
 */
export function parseChapters(description: string): Chapter[] {
  const candidates: Chapter[] = [];
  for (const rawLine of description.split("\n")) {
    const match = CHAPTER_LINE.exec(rawLine.trim());
    if (!match) continue;
    const [, first, second, third, label] = match;
    const seconds =
      third !== undefined
        ? Number(first) * 3600 + Number(second) * 60 + Number(third)
        : Number(first) * 60 + Number(second);
    candidates.push({ seconds, label: label.trim() });
  }

  if (candidates.length < MIN_CHAPTERS) return [];
  const first = candidates[0];
  if (!first || first.seconds > MAX_START_OFFSET_SECONDS) return [];
  for (let i = 1; i < candidates.length; i++) {
    const current = candidates[i];
    const previous = candidates[i - 1];
    if (!current || !previous || current.seconds <= previous.seconds) return [];
  }
  return candidates;
}

/** チャプター一覧の表示用に秒数を "1:23" / "1:02:03" 形式へ整形する */
export function formatChapterTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
