import type { Video } from "./youtube";

/** 動画 1 本分の「3行まとめ」。video-summaries.json で手動管理する(#405) */
export interface VideoSummariesData {
  /** 動画ID → 要点(箇条書き)の配列 */
  summaries: Record<string, string[]>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_POINTS = 5;
const MAX_POINT_LENGTH = 80;

/**
 * video-summaries.json の内容を検証しつつパースする(transcripts.ts と同方針)。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseVideoSummariesData(data: unknown): VideoSummariesData {
  if (typeof data !== "object" || data === null) {
    throw new Error("video-summaries.json: オブジェクトではありません");
  }
  const raw = (data as { summaries?: unknown }).summaries;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("video-summaries.json: summaries はオブジェクトである必要があります");
  }
  const summaries: Record<string, string[]> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) throw new Error("video-summaries.json: 動画IDが不正です");
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > MAX_POINTS ||
      value.some(
        (point) =>
          typeof point !== "string" || point.trim().length === 0 || point.length > MAX_POINT_LENGTH,
      )
    ) {
      throw new Error(`video-summaries.json: ${id} の要点が不正です`);
    }
    summaries[id] = value;
  }
  return { summaries };
}

/**
 * 動画 1 本の「3行まとめ」を取得する(getTranscript と同方針)。
 * データが無い動画は null を返し、呼び出し側でセクション自体を非表示にする。
 */
export function getVideoSummary(
  data: VideoSummariesData,
  video: Pick<Video, "id">,
): string[] | null {
  return data.summaries[video.id] ?? null;
}
