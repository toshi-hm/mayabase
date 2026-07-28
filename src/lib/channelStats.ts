/** チャンネル統計情報。channel-stats.json に永続化される */
export interface ChannelStats {
  /** 登録者数。API 未設定時・取得失敗時・チャンネル側で非公開設定の場合は null */
  subscriberCount: number | null;
  /** 最終取得日時(ISO 8601)。一度も取得していなければ null */
  fetchedAt: string | null;
}

export function createEmptyChannelStats(): ChannelStats {
  return { subscriberCount: null, fetchedAt: null };
}

/**
 * channel-stats.json の内容を検証しつつパースする。
 * スキーマ不一致は具体的なメッセージ付きで throw する(呼び出し側でフォールバック)。
 */
export function parseChannelStats(data: unknown): ChannelStats {
  if (typeof data !== "object" || data === null) {
    throw new Error("channel-stats.json: オブジェクトではありません");
  }
  const { subscriberCount, fetchedAt } = data as {
    subscriberCount?: unknown;
    fetchedAt?: unknown;
  };
  if (subscriberCount !== null && typeof subscriberCount !== "number") {
    throw new Error("channel-stats.json: subscriberCount は数値か null である必要があります");
  }
  if (fetchedAt !== null && typeof fetchedAt !== "string") {
    throw new Error("channel-stats.json: fetchedAt は文字列か null である必要があります");
  }
  return { subscriberCount: subscriberCount ?? null, fetchedAt: fetchedAt ?? null };
}

/**
 * YouTube Data API v3 `channels.list`(part=statistics)のレスポンスから登録者数を取り出す。
 * チャンネル側の設定で `hiddenSubscriberCount: true`(登録者数非公開)の場合は null を返す。
 * レスポンス形式が想定と異なる場合も例外を投げず null を返す(呼び出し側でフォールバック)。
 */
export function parseChannelStatsApiResponse(data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const statistics = (items[0] as { statistics?: unknown } | undefined)?.statistics;
  if (typeof statistics !== "object" || statistics === null) return null;
  const { subscriberCount, hiddenSubscriberCount } = statistics as {
    subscriberCount?: unknown;
    hiddenSubscriberCount?: unknown;
  };
  if (hiddenSubscriberCount === true) return null;
  if (typeof subscriberCount !== "string" || !/^\d+$/.test(subscriberCount)) return null;
  return Number(subscriberCount);
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
