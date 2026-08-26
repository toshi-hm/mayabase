/**
 * 登録者数の推移履歴。channel-stats-history.json に永続化される(#249)。
 * channel-stats.json が最新の1件のみを保持するのに対し、こちらは
 * 日次cron実行のたびに追記され、成長トレンドのスパークライン表示に使う。
 */
export interface ChannelStatsHistoryEntry {
  /** 取得日(日本時間基準の YYYY-MM-DD)。1日1件にまとめるためのキー */
  date: string;
  /** その日時点の登録者数 */
  subscriberCount: number;
}

/** 履歴として保持する最大件数(直近90日分。ファイルサイズ抑制のため #249) */
export const MAX_HISTORY_ENTRIES = 90;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });

/**
 * ISO 8601 の日時から日本時間基準の日付(YYYY-MM-DD)を算出する。
 * fetchedAt(channel-stats.json)と履歴の日付キーを同じ基準で揃えるために使う。
 */
export function toJstDateString(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    throw new Error(`toJstDateString: 不正な日時文字列です: ${iso}`);
  }
  // en-CA ロケールは "YYYY-MM-DD" 形式を返すため、そのまま date キーとして使える
  return jstDateFormatter.format(new Date(time));
}

export function createEmptyChannelStatsHistory(): ChannelStatsHistoryEntry[] {
  return [];
}

/**
 * channel-stats-history.json の内容を検証しつつパースする。
 * スキーマ不一致は具体的なメッセージ付きで throw する(呼び出し側でフォールバック)。
 */
export function parseChannelStatsHistory(data: unknown): ChannelStatsHistoryEntry[] {
  if (!Array.isArray(data)) {
    throw new Error("channel-stats-history.json: 配列ではありません");
  }
  return data.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`channel-stats-history.json[${index}]: オブジェクトではありません`);
    }
    const { date, subscriberCount } = entry as { date?: unknown; subscriberCount?: unknown };
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
      throw new Error(
        `channel-stats-history.json[${index}]: date は YYYY-MM-DD 形式の文字列である必要があります`,
      );
    }
    if (typeof subscriberCount !== "number") {
      throw new Error(
        `channel-stats-history.json[${index}]: subscriberCount は数値である必要があります`,
      );
    }
    return { date, subscriberCount };
  });
}

/**
 * 履歴に新しいスナップショットを追記する(#249)。
 * - 同日分が既にあれば上書きする(1日に複数回実行されても1エントリのみ保持)
 * - date 昇順を維持する
 * - maxEntries を超えた分は古い方から間引く(ファイルサイズ抑制)
 */
export function appendChannelStatsHistory(
  history: readonly ChannelStatsHistoryEntry[],
  entry: ChannelStatsHistoryEntry,
  maxEntries: number = MAX_HISTORY_ENTRIES,
): ChannelStatsHistoryEntry[] {
  const withoutSameDay = history.filter((h) => h.date !== entry.date);
  const merged = [...withoutSameDay, entry].sort((a, b) => a.date.localeCompare(b.date));
  return merged.slice(Math.max(0, merged.length - maxEntries));
}

/** スパークライン用の1点(SVG座標系。左上が原点) */
export interface SparklinePoint {
  x: number;
  y: number;
}

/**
 * 登録者数の推移から折れ線グラフ用の座標列を算出する(#249)。
 * - 履歴が2件未満(折れ線を描けない)場合は null を返し、呼び出し側で非表示にする
 * - 全期間で値が変動していない場合は縦方向中央の水平線にする(ゼロ除算回避)
 * - padding を設け、線の太さ分の見切れを防ぐ
 */
export function buildSparklinePoints(
  history: readonly ChannelStatsHistoryEntry[],
  width: number,
  height: number,
  padding = 2,
): SparklinePoint[] | null {
  if (history.length < 2) return null;

  const values = history.map((h) => h.subscriberCount);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return history.map((h, index) => {
    const x = padding + (innerWidth * index) / (history.length - 1);
    const y =
      range === 0
        ? padding + innerHeight / 2
        : padding + innerHeight * (1 - (h.subscriberCount - min) / range);
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });
}

/** buildSparklinePoints() の結果を `<polyline points="...">` 属性値へ変換する */
export function sparklinePointsToPolyline(points: readonly SparklinePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
