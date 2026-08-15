/** チャンネル統計情報。channel-stats.json に永続化される */
export interface ChannelStats {
  /** 登録者数。API 未設定時・取得失敗時・チャンネル側で非公開設定の場合は null */
  subscriberCount: number | null;
  /** チャンネル総再生回数。API 未設定時・取得失敗時は null(#60) */
  viewCount: number | null;
  /** 最終取得日時(ISO 8601)。一度も取得していなければ null */
  fetchedAt: string | null;
}

export function createEmptyChannelStats(): ChannelStats {
  return { subscriberCount: null, viewCount: null, fetchedAt: null };
}

/**
 * channel-stats.json の内容を検証しつつパースする。
 * スキーマ不一致は具体的なメッセージ付きで throw する(呼び出し側でフォールバック)。
 * viewCount は #60 で追加したフィールドのため、旧形式(未設定)のデータも許容する。
 */
export function parseChannelStats(data: unknown): ChannelStats {
  if (typeof data !== "object" || data === null) {
    throw new Error("channel-stats.json: オブジェクトではありません");
  }
  const { subscriberCount, viewCount, fetchedAt } = data as {
    subscriberCount?: unknown;
    viewCount?: unknown;
    fetchedAt?: unknown;
  };
  if (
    subscriberCount !== null &&
    subscriberCount !== undefined &&
    typeof subscriberCount !== "number"
  ) {
    throw new Error("channel-stats.json: subscriberCount は数値か null である必要があります");
  }
  if (viewCount !== null && viewCount !== undefined && typeof viewCount !== "number") {
    throw new Error("channel-stats.json: viewCount は数値か null である必要があります");
  }
  if (fetchedAt !== null && fetchedAt !== undefined && typeof fetchedAt !== "string") {
    throw new Error("channel-stats.json: fetchedAt は文字列か null である必要があります");
  }
  return {
    subscriberCount: subscriberCount ?? null,
    viewCount: viewCount ?? null,
    fetchedAt: fetchedAt ?? null,
  };
}

/**
 * YouTube Data API v3 `channels.list`(part=statistics)のレスポンスから
 * 登録者数・チャンネル総再生回数を取り出す(#60)。
 * チャンネル側の設定で `hiddenSubscriberCount: true`(登録者数非公開)の場合、
 * 登録者数のみ null を返す(総再生回数は非公開設定の対象外)。
 * レスポンス形式が想定と異なる場合も例外を投げず null を返す(呼び出し側でフォールバック)。
 */
export function parseChannelStatsApiResponse(data: unknown): {
  subscriberCount: number | null;
  viewCount: number | null;
} {
  if (typeof data !== "object" || data === null) return { subscriberCount: null, viewCount: null };
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0)
    return { subscriberCount: null, viewCount: null };
  const statistics = (items[0] as { statistics?: unknown } | undefined)?.statistics;
  if (typeof statistics !== "object" || statistics === null) {
    return { subscriberCount: null, viewCount: null };
  }
  const { subscriberCount, viewCount, hiddenSubscriberCount } = statistics as {
    subscriberCount?: unknown;
    viewCount?: unknown;
    hiddenSubscriberCount?: unknown;
  };
  const parsedSubscriberCount =
    hiddenSubscriberCount === true
      ? null
      : typeof subscriberCount === "string" && /^\d+$/.test(subscriberCount)
        ? Number(subscriberCount)
        : null;
  const parsedViewCount =
    typeof viewCount === "string" && /^\d+$/.test(viewCount) ? Number(viewCount) : null;
  return { subscriberCount: parsedSubscriberCount, viewCount: parsedViewCount };
}

/**
 * 表示用に登録者数を整形する(日本語表記)。
 * 1万以上は「○万人」(小数第1位、.0 は省略)、それ未満は3桁区切りの「○人」。
 * 例: 12345 → "1.2万人"、150000 → "15万人"、900 → "900人"
 */
export function formatSubscriberCount(count: number): string {
  if (count >= 10_000) {
    const man = Math.round((count / 10_000) * 10) / 10;
    const label = Number.isInteger(man) ? man.toFixed(0) : man.toFixed(1);
    return `${label}万人`;
  }
  return `${count.toLocaleString("ja-JP")}人`;
}

/**
 * 登録者数の桁数に応じたマイルストーンの刻み幅。
 * 1,000未満は100人刻み、1,000〜10,000未満は1,000人刻み、以降も同様に一桁ずつ広げる(#200)。
 */
function subscriberMilestoneStep(count: number): number {
  if (count < 1_000) return 100;
  if (count < 10_000) return 1_000;
  if (count < 100_000) return 10_000;
  return 100_000;
}

/**
 * 登録者数から「次のキリの良い目標」を計算する(#200)。
 * 常に現在の登録者数より大きい値を返す(丁度キリが良い数値でも次の刻みに進む)。
 * 手動設定ではなく計算値にすることで、古い目標のまま更新を忘れるリスクを構造的に防ぐ。
 * 例: 284 → 300、999 → 1000、1000 → 2000、12345 → 20000
 */
export function nextSubscriberMilestone(count: number): number {
  const step = subscriberMilestoneStep(count);
  return (Math.floor(count / step) + 1) * step;
}

const fetchedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * 登録者数の取得日時を表示用に整形する(JST)。
 * リアルタイム取得ではないため、いつ時点の数値かを併記する目的で使う。
 * 不正な日時文字列の場合は空文字を返す(`formatDateJa` と同じ方針。#80)。
 * 例: "2026-08-01T09:00:00Z" → "8/1 18:00時点"
 */
export function formatFetchedAt(fetchedAt: string): string {
  const time = Date.parse(fetchedAt);
  if (Number.isNaN(time)) return "";
  return `${fetchedAtFormatter.format(new Date(time))}時点`;
}
