/**
 * YouTube チャンネルの動画一覧を RSS から取得し、src/data/videos.json を更新する。
 *
 * 実行: bun run fetch
 *
 * 設計方針(docs/02-design.md、docs/03-content-expansion.md):
 * - 取得経路は 2 系統:
 *   1. YOUTUBE_API_KEY が設定されていれば YouTube Data API で全動画を取得(全ページ辿る)
 *   2. 未設定なら RSS(最新 15 件のみ)。既存 videos.json とマージして過去動画も保持する
 *   API 取得に失敗したときは RSS にフォールバックする(全経路失敗でも既存データを維持)
 * - Shorts 判定は未判定(isShort: null)の動画のみ行い、確定値は再判定しない
 * - 失敗しても既存の videos.json を残して exit 0(ビルドを決して落とさない)
 */
import { rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { site } from "../src/config/site";
import { type ChannelStats, parseChannelStatsApiResponse } from "../src/lib/channelStats";
import {
  appendChannelStatsHistory,
  type ChannelStatsHistoryEntry,
  createEmptyChannelStatsHistory,
  parseChannelStatsHistory,
  toJstDateString,
} from "../src/lib/channelStatsHistory";
import { newlyPublishedVideos } from "../src/lib/push";
import {
  createEmptyVideosData,
  extractChannelId,
  type FeedEntry,
  type FetchLike,
  mapWithConcurrency,
  mergeVideos,
  parseFeed,
  parsePlaylistItemsPage,
  parseVideoDurationsResponse,
  parseVideoStatisticsResponse,
  parseVideosData,
  probeHqThumbnail,
  probeIsShort,
  uploadsPlaylistId,
  type Video,
  type VideosData,
} from "../src/lib/youtube";
import { PENDING_NOTIFICATIONS_PATH } from "./send-push-notifications";

const VIDEOS_JSON_PATH = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));
const CHANNEL_STATS_JSON_PATH = fileURLToPath(
  new URL("../src/data/channel-stats.json", import.meta.url),
);
const CHANNEL_STATS_HISTORY_JSON_PATH = fileURLToPath(
  new URL("../src/data/channel-stats-history.json", import.meta.url),
);
const PROBE_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15_000;
const API_PAGE_SIZE = 50; // playlistItems.list の最大値
const API_MAX_PAGES = 40; // 暴走防止(最大 2000 件相当)
const VIEW_COUNT_BATCH_SIZE = 50; // videos.list の id パラメータに指定できる最大件数
const VIEW_COUNT_CONCURRENCY = 4;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "accept-language": "ja", ...init?.headers },
  });
}

async function loadExisting(): Promise<VideosData> {
  try {
    const file = Bun.file(VIDEOS_JSON_PATH);
    if (!(await file.exists())) return createEmptyVideosData();
    return parseVideosData(await file.json());
  } catch (error) {
    console.warn(
      "[fetch-videos] 既存 videos.json の読み込みに失敗したため空データから再構築します:",
      error,
    );
    return createEmptyVideosData();
  }
}

async function loadExistingChannelStatsHistory(): Promise<ChannelStatsHistoryEntry[]> {
  try {
    const file = Bun.file(CHANNEL_STATS_HISTORY_JSON_PATH);
    if (!(await file.exists())) return createEmptyChannelStatsHistory();
    return parseChannelStatsHistory(await file.json());
  } catch (error) {
    console.warn(
      "[fetch-videos] 既存 channel-stats-history.json の読み込みに失敗したため空データから再構築します:",
      error,
    );
    return createEmptyChannelStatsHistory();
  }
}

async function resolveChannelId(
  existing: VideosData,
  fetchFn: FetchLike = fetchWithTimeout,
): Promise<string | null> {
  if (site.youtube.channelId) return site.youtube.channelId;
  if (existing.channelId) return existing.channelId;

  // 補助手段: チャンネルページから externalId を抽出(site.ts への設定を推奨)
  console.warn(
    "[fetch-videos] site.ts に channelId が未設定のため、チャンネルページから解決を試みます",
  );
  const res = await fetchFn(`https://www.youtube.com/${site.youtube.handle}`);
  if (!res.ok) {
    console.warn(`[fetch-videos] チャンネルページの取得に失敗しました (HTTP ${res.status})`);
    return null;
  }
  return extractChannelId(await res.text());
}

/**
 * YouTube Data API v3 でチャンネルの全アップロード動画を取得する。
 * uploads プレイリストを nextPageToken が尽きるまで辿る。
 * 失敗時は null を返して呼び出し側で RSS にフォールバックさせる。
 */
async function fetchAllViaApi(
  channelId: string,
  apiKey: string,
  fetchFn: FetchLike = fetchWithTimeout,
): Promise<FeedEntry[] | null> {
  const playlistId = uploadsPlaylistId(channelId);
  if (!playlistId) {
    console.warn(
      `[fetch-videos] channelId から uploads プレイリストを導出できません: ${channelId}`,
    );
    return null;
  }

  const entries: FeedEntry[] = [];
  let pageToken: string | null = null;
  let remaining = false; // ループ終了時に true なら未取得ページが残っている(上限打ち切り)
  for (let page = 0; page < API_MAX_PAGES; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(API_PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let nextPageToken: string | null;
    try {
      // API キーは URL クエリではなく X-goog-api-key ヘッダで渡す。
      // fetch の接続エラー時にエラーオブジェクトが URL(path)を保持しても
      // キーが漏れないようにするため(GitHub Actions のマスキングが効かない
      // ローカル実行やログ貼り付け経路での漏洩を防ぐ)。
      const res = await fetchFn(url.toString(), {
        headers: { "X-goog-api-key": apiKey },
      });
      if (!res.ok) {
        console.warn(`[fetch-videos] Data API がエラーを返しました (HTTP ${res.status})`);
        return null;
      }
      // res.json() の失敗(壊れた JSON 等)も含めて捕捉し、RSS へフォールバックさせる
      const parsed = parsePlaylistItemsPage(await res.json());
      entries.push(...parsed.entries);
      nextPageToken = parsed.nextPageToken;
    } catch (error) {
      // error はキーを含み得る URL / path を保持するため message のみをログする
      console.warn(
        "[fetch-videos] Data API リクエストに失敗しました:",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    if (!nextPageToken) {
      remaining = false;
      break;
    }
    pageToken = nextPageToken;
    remaining = true;
  }

  if (remaining) {
    console.warn(
      `[fetch-videos] ページ数上限(${API_MAX_PAGES})に達したため取得を打ち切りました。未取得の動画が残っている可能性があります。`,
    );
  }
  if (entries.length === 0) {
    // 0 件は「本当に動画が無い」より API 側の異常を疑い、RSS にフォールバックする
    console.warn(
      "[fetch-videos] Data API から動画を取得できませんでした。RSS にフォールバックします。",
    );
    return null;
  }
  console.log(`[fetch-videos] Data API から ${entries.length} 件を取得しました`);
  return entries;
}

/**
 * YouTube Data API v3 `channels.list`(part=statistics)でチャンネル登録者数を取得し、
 * src/data/channel-stats.json を更新する。失敗しても例外を投げない(呼び出し側の
 * 動画取得フローを止めない。既存ファイルは維持される)。
 */
async function updateChannelStats(
  channelId: string,
  apiKey: string,
  fetchFn: FetchLike = fetchWithTimeout,
): Promise<void> {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", channelId);
    const res = await fetchFn(url.toString(), {
      headers: { "X-goog-api-key": apiKey },
    });
    if (!res.ok) {
      console.warn(`[fetch-videos] チャンネル統計の取得に失敗しました (HTTP ${res.status})`);
      return;
    }
    const { subscriberCount, viewCount } = parseChannelStatsApiResponse(await res.json());
    const fetchedAt = new Date().toISOString();
    const data: ChannelStats = { subscriberCount, viewCount, fetchedAt };
    const tmpPath = `${CHANNEL_STATS_JSON_PATH}.tmp`;
    await Bun.write(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
    await rename(tmpPath, CHANNEL_STATS_JSON_PATH);
    console.log(
      `[fetch-videos] チャンネル統計を保存しました(登録者数: ${subscriberCount ?? "非公開/取得不可"}、総再生回数: ${viewCount ?? "取得不可"})`,
    );

    // 登録者数の推移履歴に追記する(#249)。非公開/取得不可(null)の場合はスパークラインの
    // 信頼性を損なうため追記しない(既存の履歴はそのまま維持される)。
    if (subscriberCount !== null) {
      const existingHistory = await loadExistingChannelStatsHistory();
      const updatedHistory = appendChannelStatsHistory(existingHistory, {
        date: toJstDateString(fetchedAt),
        subscriberCount,
      });
      const historyTmpPath = `${CHANNEL_STATS_HISTORY_JSON_PATH}.tmp`;
      await Bun.write(historyTmpPath, `${JSON.stringify(updatedHistory, null, 2)}\n`);
      await rename(historyTmpPath, CHANNEL_STATS_HISTORY_JSON_PATH);
      console.log(`[fetch-videos] 登録者数の推移履歴を保存しました(${updatedHistory.length} 件)`);
    }
  } catch (error) {
    console.warn(
      "[fetch-videos] チャンネル統計の取得でエラーが発生しました:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function probeShorts(videos: Video[]): Promise<Video[]> {
  const unknowns = videos.filter((v) => v.isShort === null);
  if (unknowns.length === 0) return videos;

  console.log(`[fetch-videos] Shorts 判定: ${unknowns.length} 件`);
  const results = await mapWithConcurrency(unknowns, PROBE_CONCURRENCY, async (video) => {
    let result = await probeIsShort(video.id, fetchWithTimeout);
    if (result === null) {
      // 一時的な失敗に備えて 300ms 後に 1 回だけリトライ
      await new Promise((resolve) => setTimeout(resolve, 300));
      result = await probeIsShort(video.id, fetchWithTimeout);
    }
    return { id: video.id, isShort: result };
  });

  const byId = new Map(results.map((r) => [r.id, r.isShort]));
  return videos.map((video) =>
    video.isShort === null ? { ...video, isShort: byId.get(video.id) ?? null } : video,
  );
}

/** fetchVideoDetails の結果。バッチ単位・全体集約の両方で使う共通形 */
interface VideoDetailsResult {
  viewCounts: Map<string, number>;
  durations: Map<string, string>;
}

/**
 * OGP画像の高解像度化のため、hq720 サムネイルの存在を確認する(#211)。
 * probeShorts と同じ「未確認(null/undefined)の動画だけ確認し、確定値は再判定しない」設計だが、
 * fetchFn を注入できるようにしてテスト容易性を確保している(probeShorts の fetchWithTimeout
 * 直呼びとは異なる)。
 */
async function probeHqThumbnails(
  videos: Video[],
  fetchFn: FetchLike = fetchWithTimeout,
): Promise<Video[]> {
  const unknowns = videos.filter((v) => v.hasHqThumbnail == null);
  if (unknowns.length === 0) return videos;

  console.log(`[fetch-videos] hq720 サムネイル存在確認: ${unknowns.length} 件`);
  const results = await mapWithConcurrency(unknowns, PROBE_CONCURRENCY, async (video) => {
    let result = await probeHqThumbnail(video.id, fetchFn);
    if (result === null) {
      // 一時的な失敗に備えて 300ms 後に 1 回だけリトライ
      await new Promise((resolve) => setTimeout(resolve, 300));
      result = await probeHqThumbnail(video.id, fetchFn);
    }
    return { id: video.id, hasHqThumbnail: result };
  });

  const byId = new Map(results.map((r) => [r.id, r.hasHqThumbnail]));
  return videos.map((video) =>
    video.hasHqThumbnail == null ? { ...video, hasHqThumbnail: byId.get(video.id) ?? null } : video,
  );
}

/**
 * YouTube Data API v3 `videos.list`(part=statistics,contentDetails)で
 * 全動画の再生回数(#35)・再生時間(#173)を取得する。
 * 再生時間は再生回数と同じレスポンス JSON から取り出せるため、`part` に `contentDetails`
 * を加えるだけで同一リクエストからほぼ追加コストなく取得できる。
 * `id` パラメータは1リクエストあたり最大50件のため、動画IDを50件ずつのバッチに分けて取得する。
 * 個別バッチの失敗は無視し(取得できた分だけ反映)、既存の viewCount / duration は失敗時にも
 * 維持される(mergeVideos/main 側で prev の値にフォールバックするため)。
 */
async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
  fetchFn: FetchLike = fetchWithTimeout,
): Promise<VideoDetailsResult> {
  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += VIEW_COUNT_BATCH_SIZE) {
    batches.push(videoIds.slice(i, i + VIEW_COUNT_BATCH_SIZE));
  }

  const results = await mapWithConcurrency(batches, VIEW_COUNT_CONCURRENCY, async (batch) => {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "statistics,contentDetails");
      url.searchParams.set("id", batch.join(","));
      const res = await fetchFn(url.toString(), {
        headers: { "X-goog-api-key": apiKey },
      });
      if (!res.ok) {
        console.warn(`[fetch-videos] 再生回数・再生時間の取得に失敗しました (HTTP ${res.status})`);
        return { viewCounts: new Map<string, number>(), durations: new Map<string, string>() };
      }
      const data = await res.json();
      return {
        viewCounts: parseVideoStatisticsResponse(data),
        durations: parseVideoDurationsResponse(data),
      };
    } catch (error) {
      console.warn(
        "[fetch-videos] 再生回数・再生時間の取得でエラーが発生しました:",
        error instanceof Error ? error.message : String(error),
      );
      return { viewCounts: new Map<string, number>(), durations: new Map<string, string>() };
    }
  });

  const viewCounts = new Map<string, number>();
  const durations = new Map<string, string>();
  for (const batchResult of results) {
    for (const [id, viewCount] of batchResult.viewCounts) viewCounts.set(id, viewCount);
    for (const [id, duration] of batchResult.durations) durations.set(id, duration);
  }
  return { viewCounts, durations };
}

async function main(fetchFn: FetchLike = fetchWithTimeout): Promise<void> {
  const existing = await loadExisting();

  const channelId = await resolveChannelId(existing, fetchFn);
  if (!channelId) {
    console.warn(
      "[fetch-videos] channelId を解決できませんでした。src/config/site.ts の youtube.channelId を設定してください。既存データを維持します。",
    );
    return;
  }

  // API キーがあれば全動画取得を試み、失敗時は RSS(最新 15 件)にフォールバックする
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  let entries: FeedEntry[] | null = null;
  if (apiKey) {
    entries = await fetchAllViaApi(channelId, apiKey, fetchFn);
    // 動画取得の成否に関わらず試みる(quota 消費は channels.list で 1 unit と小さい)
    await updateChannelStats(channelId, apiKey, fetchFn);
  } else {
    console.log(
      "[fetch-videos] YOUTUBE_API_KEY 未設定のため RSS(最新 15 件)を使用します。全動画取得には API キーを設定してください。",
    );
  }

  if (entries === null) {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetchFn(feedUrl);
    if (!res.ok) {
      console.warn(
        `[fetch-videos] RSS の取得に失敗しました (HTTP ${res.status})。既存データを維持します。`,
      );
      return;
    }
    entries = parseFeed(await res.text());
  }

  if (entries.length === 0) {
    console.warn("[fetch-videos] 取得できた動画がありませんでした。既存データを維持します。");
    return;
  }

  let merged = await probeShorts(mergeVideos(existing.videos, entries));
  merged = await probeHqThumbnails(merged, fetchFn);

  if (apiKey) {
    const { viewCounts, durations } = await fetchVideoDetails(
      merged.map((v) => v.id),
      apiKey,
      fetchFn,
    );
    if (viewCounts.size > 0 || durations.size > 0) {
      merged = merged.map((video) => ({
        id: video.id,
        title: video.title,
        description: video.description,
        publishedAt: video.publishedAt,
        isShort: video.isShort,
        hasHqThumbnail: video.hasHqThumbnail,
        viewCount: viewCounts.get(video.id) ?? video.viewCount,
        duration: durations.get(video.id) ?? video.duration,
      }));
      console.log(
        `[fetch-videos] 再生回数を ${viewCounts.size} 件、再生時間を ${durations.size} 件取得しました`,
      );
    }
  }

  const data: VideosData = {
    channelId,
    fetchedAt: new Date().toISOString(),
    videos: merged,
  };

  // 一時ファイル → rename の原子的書き込み(中断時に壊れた JSON を残さない)
  const tmpPath = `${VIDEOS_JSON_PATH}.tmp`;
  await Bun.write(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmpPath, VIDEOS_JSON_PATH);
  const shorts = merged.filter((v) => v.isShort === true).length;
  console.log(
    `[fetch-videos] ${merged.length} 件を保存しました(Shorts: ${shorts} 件、未判定: ${merged.filter((v) => v.isShort === null).length} 件)`,
  );

  // 新着動画のプッシュ通知(#157)。既存データが空(初回実行等)の場合は全件が「新着」扱いに
  // なってしまい通知が乱発するため、既存データがある場合のみ差分を計算する。
  //
  // 通知の実際の送信はここでは行わない(#323)。以前はここで直接 sendNewVideoNotifications() を
  // 呼んでいたが、この時点では update-videos.yml の後続ステップ(検証・コミット)がまだ成功する
  // かどうか分からず、検証失敗でコミット・pushされなかった場合にも、まだ存在しないページへの
  // リンクを含む通知が購読者に届いてしまう不整合があった。そのため、新着動画の一覧を一時ファイル
  // (PENDING_NOTIFICATIONS_PATH)に書き出すだけに留め、実際の送信は「変更があればコミット」
  // ステップの成功後に実行される専用ステップ(scripts/send-push-notifications.ts の
  // import.meta.main ブロック)に委ねる。
  if (existing.videos.length > 0) {
    const newlyPublished = newlyPublishedVideos(existing.videos, merged);
    if (newlyPublished.length > 0) {
      await Bun.write(PENDING_NOTIFICATIONS_PATH, `${JSON.stringify(newlyPublished, null, 2)}\n`);
      console.log(
        `[fetch-videos] 新着動画 ${newlyPublished.length} 件を通知待ちとして記録しました(送信はコミット成功後)`,
      );
    }
  }
}

// import.meta.main は直接実行時(bun run scripts/fetch-videos.ts)のみ true になり、
// テストからの import 時は false になる(Bun の仕様)。これによりテストの import 時に
// main() が実際にネットワークアクセスするのを防ぐ。
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // ビルドは決して落とさない(既存の videos.json でビルド継続)
    console.warn("[fetch-videos] 取得処理でエラーが発生しました。既存データを維持します:", error);
  }
}

export { fetchAllViaApi, fetchVideoDetails, main, resolveChannelId, updateChannelStats };
