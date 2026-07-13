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
import {
  createEmptyVideosData,
  extractChannelId,
  type FeedEntry,
  mapWithConcurrency,
  mergeVideos,
  parseFeed,
  parsePlaylistItemsPage,
  parseVideosData,
  probeIsShort,
  uploadsPlaylistId,
  type Video,
  type VideosData,
} from "../src/lib/youtube";

const VIDEOS_JSON_PATH = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));
const PROBE_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 15_000;
const API_PAGE_SIZE = 50; // playlistItems.list の最大値
const API_MAX_PAGES = 40; // 暴走防止(最大 2000 件相当)

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

async function resolveChannelId(existing: VideosData): Promise<string | null> {
  if (site.youtube.channelId) return site.youtube.channelId;
  if (existing.channelId) return existing.channelId;

  // 補助手段: チャンネルページから externalId を抽出(site.ts への設定を推奨)
  console.warn(
    "[fetch-videos] site.ts に channelId が未設定のため、チャンネルページから解決を試みます",
  );
  const res = await fetchWithTimeout(`https://www.youtube.com/${site.youtube.handle}`);
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
async function fetchAllViaApi(channelId: string, apiKey: string): Promise<FeedEntry[] | null> {
  const playlistId = uploadsPlaylistId(channelId);
  if (!playlistId) {
    console.warn(
      `[fetch-videos] channelId から uploads プレイリストを導出できません: ${channelId}`,
    );
    return null;
  }

  const entries: FeedEntry[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < API_MAX_PAGES; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(API_PAGE_SIZE));
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let res: Response;
    try {
      res = await fetchWithTimeout(url.toString());
    } catch (error) {
      console.warn("[fetch-videos] Data API リクエストに失敗しました:", error);
      return null;
    }
    if (!res.ok) {
      console.warn(`[fetch-videos] Data API がエラーを返しました (HTTP ${res.status})`);
      return null;
    }

    const { entries: pageEntries, nextPageToken } = parsePlaylistItemsPage(await res.json());
    entries.push(...pageEntries);
    if (!nextPageToken) break;
    pageToken = nextPageToken;
  }

  console.log(`[fetch-videos] Data API から ${entries.length} 件を取得しました`);
  return entries;
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

async function main(): Promise<void> {
  const existing = await loadExisting();

  const channelId = await resolveChannelId(existing);
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
    entries = await fetchAllViaApi(channelId, apiKey);
  } else {
    console.log(
      "[fetch-videos] YOUTUBE_API_KEY 未設定のため RSS(最新 15 件)を使用します。全動画取得には API キーを設定してください。",
    );
  }

  if (entries === null) {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetchWithTimeout(feedUrl);
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

  const merged = await probeShorts(mergeVideos(existing.videos, entries));
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
}

try {
  await main();
} catch (error) {
  // ビルドは決して落とさない(既存の videos.json でビルド継続)
  console.warn("[fetch-videos] 取得処理でエラーが発生しました。既存データを維持します:", error);
}
