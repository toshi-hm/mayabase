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
  /**
   * その日時点のチャンネル総再生回数(#407)。
   * このフィールド追加前の既存エントリには存在しないため省略可能とし、
   * 未設定のエントリは総再生回数の推移グラフから除外する(呼び出し側の責務)。
   */
  viewCount?: number;
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
    const { viewCount } = entry as { viewCount?: unknown };
    if (viewCount !== undefined && typeof viewCount !== "number") {
      throw new Error(`channel-stats-history.json[${index}]: viewCount は数値である必要があります`);
    }
    return { date, subscriberCount, ...(viewCount !== undefined && { viewCount }) };
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
 * 数値列から折れ線グラフ用の座標列を算出する共通ロジック(#249, #407)。
 * - 値が2件未満(折れ線を描けない)場合は null を返し、呼び出し側で非表示にする
 * - 全期間で値が変動していない場合は縦方向中央の水平線にする(ゼロ除算回避)
 * - padding を設け、線の太さ分の見切れを防ぐ
 */
function buildSparklinePointsFromValues(
  values: readonly number[],
  width: number,
  height: number,
  padding: number,
): SparklinePoint[] | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return values.map((value, index) => {
    const x = padding + (innerWidth * index) / (values.length - 1);
    const y =
      range === 0 ? padding + innerHeight / 2 : padding + innerHeight * (1 - (value - min) / range);
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });
}

/** 登録者数の推移から折れ線グラフ用の座標列を算出する(#249)。 */
export function buildSparklinePoints(
  history: readonly ChannelStatsHistoryEntry[],
  width: number,
  height: number,
  padding = 2,
): SparklinePoint[] | null {
  return buildSparklinePointsFromValues(
    history.map((h) => h.subscriberCount),
    width,
    height,
    padding,
  );
}

/**
 * チャンネル総再生回数の推移から折れ線グラフ用の座標列を算出する(#407)。
 * `viewCount` はフィールド追加前の既存エントリには存在しないため、
 * 値を持つエントリのみを対象にする(欠損分は補間せず単純に除外する)。
 */
export function buildViewCountSparklinePoints(
  history: readonly ChannelStatsHistoryEntry[],
  width: number,
  height: number,
  padding = 2,
): SparklinePoint[] | null {
  const values = history.map((h) => h.viewCount).filter((v): v is number => typeof v === "number");
  return buildSparklinePointsFromValues(values, width, height, padding);
}

/**
 * チャンネル総再生回数の推移グラフが実際にカバーする開始日を算出する(#435)。
 * `viewCount` はフィールド追加前の既存エントリには存在しないため、履歴全体の開始日
 * (`history[0].date`)とは一致しないことがある。グラフの説明文には、登録者数推移の
 * 開始日ではなくこちらを使う必要がある。
 */
export function findViewCountHistoryStartDate(
  history: readonly ChannelStatsHistoryEntry[],
): string | null {
  return history.find((h) => h.viewCount !== undefined)?.date ?? null;
}

/** buildSparklinePoints() の結果を `<polyline points="...">` 属性値へ変換する */
export function sparklinePointsToPolyline(points: readonly SparklinePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * 数値列から開始値・終了値・増減をテキストで要約する共通ロジック(#481)。
 * スパークラインは折れ線の傾きで増減を視覚的に伝えるが、同じ情報が
 * スクリーンリーダー利用者には渡らないため、`aria-label`/`figcaption` 用に使う。
 * 値が2件未満(折れ線を描けない)場合は null を返す(buildSparklinePointsFromValues と同じ方針)。
 */
function buildTrendSummary(
  values: readonly number[],
  formatValue: (value: number) => string,
): string | null {
  if (values.length < 2) return null;

  const start = values[0] as number;
  const end = values[values.length - 1] as number;
  const diff = end - start;
  const trendText =
    diff === 0 ? "横ばい" : diff > 0 ? `${formatValue(diff)}増加` : `${formatValue(-diff)}減少`;

  return `${formatValue(start)}から${formatValue(end)}へ、${trendText}`;
}

/** 登録者数の推移を要約するテキストを算出する(#481)。 */
export function buildSubscriberTrendSummary(
  history: readonly ChannelStatsHistoryEntry[],
  formatCount: (count: number) => string,
): string | null {
  return buildTrendSummary(
    history.map((h) => h.subscriberCount),
    formatCount,
  );
}

/**
 * チャンネル総再生回数の推移を要約するテキストを算出する(#481)。
 * `viewCount` はフィールド追加前の既存エントリには存在しないため、
 * buildViewCountSparklinePoints と同様に値を持つエントリのみを対象にする。
 */
export function buildViewCountTrendSummary(
  history: readonly ChannelStatsHistoryEntry[],
  formatCount: (count: number) => string,
): string | null {
  const values = history.map((h) => h.viewCount).filter((v): v is number => typeof v === "number");
  return buildTrendSummary(values, formatCount);
}
