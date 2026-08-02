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
 * 例: "2026-08-01T09:00:00Z" → "8/1 18:00時点"
 */
export function formatFetchedAt(fetchedAt: string): string {
  return `${fetchedAtFormatter.format(new Date(fetchedAt))}時点`;
}
