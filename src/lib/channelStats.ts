import { formatViewCount } from "./format";

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
 * 登録者数を省略せず3桁区切りで整形する(#481)。
 * `formatSubscriberCount` は1万以上を「○.○万人」に丸めるため、推移の開始値・終了値を
 * 丸めた値で表示すると、実際は異なる値でも同じ表示文字列に収束し、増減テキストと
 * 矛盾しうる(例: 147,132回→150,451回が両方「15万回」に丸まる)。丸めない表記が必要な
 * 箇所(スクリーンリーダー向けの推移要約等)ではこちらを使う。
 */
export function formatSubscriberCountFull(count: number): string {
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

const fetchedAtFormatterWithYear = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const jstYearFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
});

/**
 * 登録者数の取得日時を表示用に整形する(JST)。
 * リアルタイム取得ではないため、いつ時点の数値かを併記する目的で使う。
 * 不正な日時文字列の場合は空文字を返す(`formatDateJa` と同じ方針。#80)。
 * データ取得が長期間止まり、表示対象の日時が現在(`now`)と異なる年になっている場合は
 * 「今年の日付」との誤認を防ぐため年も併記する(#364)。
 * 例: "2026-08-01T09:00:00Z" → "8/1 18:00時点"(`now` が2026年の場合)
 *     "2025-08-01T09:00:00Z" → "2025/8/1 18:00時点"(`now` が2026年の場合)
 */
export function formatFetchedAt(fetchedAt: string, now: Date): string {
  const time = Date.parse(fetchedAt);
  if (Number.isNaN(time)) return "";
  const date = new Date(time);
  const isSameYear = jstYearFormatter.format(date) === jstYearFormatter.format(now);
  const formatter = isSameYear ? fetchedAtFormatter : fetchedAtFormatterWithYear;
  return `${formatter.format(date)}時点`;
}

/**
 * 表示用に動画本数を整形する(#438)。
 *
 * 数値フォーマットの統一ルール(#438で発生していた「14.7万回」/「147,000回」のような
 * 表記ゆれを解消するため、ここに一元化して明文化する):
 * - 桁数が大きくなりうる値(登録者数・総再生回数)は `formatSubscriberCount` /
 *   `formatViewCount` の「1万以上は『○.○万』」表記を使う。トップ・成長記録ページの
 *   既存表示の大多数がこの表記だったため、これを正とする。
 * - 動画本数のように実運用上せいぜい数百〜数千程度にしかならない値は、万表記にすると
 *   かえって直感的でなくなるため、常に3桁区切りの「○本」というプレーンな表記のみを使う。
 * 新しく数値表示を追加する場合も、この2値のどちらの性質に近いかで表記を選ぶ。
 */
export function formatVideoCount(count: number): string {
  return `${count.toLocaleString("ja-JP")}本`;
}

/**
 * トップ・動画ライブラリ・成長記録の各ページが同じ値・同じ表記・同じ最終更新時刻を
 * 表示できるよう、チャンネル統計を単一のビューモデルに正規化する(#438)。
 *
 * 各ページはこの関数を通してのみ表示用の文字列を組み立てることで、
 * 「ページごとに微妙に違う計算/表記になる」問題を構造的に防ぐ。
 * `SubscribeMilestoneNote` の「次の目標まであと○人」も、呼び出し元がこのビューの
 * `subscriberCount` をそのまま props で渡すことで、同じ登録者数から計算される。
 */
export interface ChannelStatsView {
  subscriberCount: number | null;
  /** 表示用に整形した登録者数。未取得(非公開設定・API未設定・取得失敗)は null */
  subscriberText: string | null;
  viewCount: number | null;
  /** 表示用に整形したチャンネル総再生回数。未取得は null */
  totalViewCountText: string | null;
  /** videos.json から算出した動画本数。取得の成否に関わらず常に存在する */
  videoCount: number;
  /** 表示用に整形した動画本数 */
  videoCountText: string;
  /** 次のマイルストーン。登録者数が未取得の場合は null */
  nextMilestoneText: string | null;
  /** 次のマイルストーンまでの残り人数。登録者数が未取得の場合は null */
  milestoneRemainingText: string | null;
  fetchedAt: string | null;
  /** 表示用に整形した取得日時。一度も取得に成功していない場合は null */
  fetchedAtText: string | null;
  /**
   * `fetchedAt` が null(=一度も取得に成功していない)場合にのみ入る「更新失敗」の案内文。
   * `fetchedAtText` とは排他的にどちらか一方が必ず入るため、表示側は
   * `fetchedAtText ?? updateFailedText` の1箇所だけ出せば、取得成功時は最終更新時刻を、
   * 未取得時は更新失敗である旨を必ず表示できる(#438の受け入れ条件)。
   * 一度成功した後に取得が失敗した場合、channel-stats.json は前回成功時点の内容を
   * 保持したまま更新されない(scripts/fetch-videos.ts の既存挙動)ため、その場合は
   * 「古い `fetchedAtText`」が結果的に鮮度の目安として表示され続ける。
   */
  updateFailedText: string | null;
}

export function buildChannelStatsView(
  stats: ChannelStats,
  videoCount: number,
  now: Date,
): ChannelStatsView {
  const { subscriberCount, viewCount, fetchedAt } = stats;
  const nextMilestone = subscriberCount !== null ? nextSubscriberMilestone(subscriberCount) : null;
  // formatFetchedAt は不正な日時文字列(パース不能)の場合に例外ではなく空文字列を返す(#80)。
  // fetchedAt が非 null でもここで "" になり得るため、`fetchedAtText` / `updateFailedText` が
  // 「どちらか一方だけが必ず入る」という下記の契約を保つには、空文字を null に正規化してから
  // updateFailedText の判定に使う必要がある(空文字のままだと両方とも実質「空」になり得る)。
  const fetchedAtText = fetchedAt !== null ? formatFetchedAt(fetchedAt, now) || null : null;
  return {
    subscriberCount,
    subscriberText: subscriberCount !== null ? formatSubscriberCount(subscriberCount) : null,
    viewCount,
    totalViewCountText: viewCount !== null ? formatViewCount(viewCount) : null,
    videoCount,
    videoCountText: formatVideoCount(videoCount),
    nextMilestoneText: nextMilestone !== null ? formatSubscriberCount(nextMilestone) : null,
    milestoneRemainingText:
      subscriberCount !== null && nextMilestone !== null
        ? formatSubscriberCount(nextMilestone - subscriberCount)
        : null,
    fetchedAt,
    fetchedAtText,
    updateFailedText:
      fetchedAtText === null ? "更新失敗(登録者数・総再生回数は取得できていません)" : null,
  };
}
