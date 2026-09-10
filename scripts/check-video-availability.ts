import { appendFile } from "node:fs/promises";
import videosJson from "../src/data/videos.json";
import { type FetchLike, parseVideosData, type Video } from "../src/lib/youtube";

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;

function retryDelayMs(response: Response | null): number {
  const retryAfter = response?.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 5_000) : 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export interface VideoProbeResult {
  id: string;
  title: string;
  ok: boolean;
  status: number | null;
  error: string | null;
}
export interface VideoAvailabilityReport {
  totalCount: number;
  unavailableCount: number;
  unavailable: VideoProbeResult[];
  summary: string;
}

export async function probeVideo(
  video: Pick<Video, "id" | "title">,
  fetchFn: FetchLike = fetch,
): Promise<VideoProbeResult> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video.id}`)}&format=json`;
  let lastError: string | null = null;
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchFn(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      lastStatus = response.status;
      if (response.ok || (response.status !== 429 && response.status < 500)) {
        return { id: video.id, title: video.title, ok: response.ok, status: response.status, error: null };
      }
      lastError = `HTTP ${response.status}`;
      if (attempt + 1 < MAX_ATTEMPTS) await wait(retryDelayMs(response));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt + 1 < MAX_ATTEMPTS) await wait(retryDelayMs(null));
    }
  }
  return { id: video.id, title: video.title, ok: false, status: lastStatus, error: lastError };
}

export function buildReport(
  videos: readonly Pick<Video, "id" | "title">[],
  results: readonly VideoProbeResult[],
): VideoAvailabilityReport {
  if (videos.length !== results.length) throw new Error("videosとresultsの件数が一致しません");
  const unavailable = results.filter((result) => !result.ok);
  const summary =
    unavailable.length === 0
      ? `全 ${videos.length} 件のYouTube動画は取得可能でした。`
      : [
          `${videos.length} 件中 ${unavailable.length} 件のYouTube動画で取得異常を検知しました。`,
          "",
          ...unavailable.map(
            (item) =>
              `- [${item.status === null ? "取得失敗" : `HTTP ${item.status}`}] ${item.id} ${item.title}${item.error ? ` (${item.error})` : ""}`,
          ),
        ].join("\n");
  return { totalCount: videos.length, unavailableCount: unavailable.length, unavailable, summary };
}

async function mapWithConcurrency<T, U>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  const { videos } = parseVideosData(videosJson);
  if (videos.length === 0) throw new Error("監視対象の動画が0件です");
  const results = await mapWithConcurrency(videos, CONCURRENCY, (video) => probeVideo(video));
  const report = buildReport(videos, results);
  console.log(`[check-video-availability] ${report.summary}`);
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    let delimiter = `CHECK_VIDEO_AVAILABILITY_${crypto.randomUUID()}`;
    while (report.summary.includes(delimiter)) {
      delimiter = `CHECK_VIDEO_AVAILABILITY_${crypto.randomUUID()}`;
    }
    await appendFile(
      output,
      [
        `has_unavailable=${report.unavailableCount > 0}`,
        `unavailable_count=${report.unavailableCount}`,
        `total_count=${report.totalCount}`,
        `summary<<${delimiter}`,
        report.summary,
        delimiter,
        "",
      ].join("\n"),
    );
  }
}
if (import.meta.main) await main();
