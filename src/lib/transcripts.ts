import type { Video } from "./youtube";

export interface Transcript {
  text: string;
  language: string;
}

export interface TranscriptsData {
  transcripts: Record<string, Transcript>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_TEXT_LENGTH = 500_000;

export function parseTranscriptsData(data: unknown): TranscriptsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("transcripts.json: オブジェクトではありません");
  }
  const raw = (data as { transcripts?: unknown }).transcripts;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("transcripts.json: transcripts はオブジェクトである必要があります");
  }
  const transcripts: Record<string, Transcript> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) throw new Error("transcripts.json: 動画IDが不正です");
    if (typeof value !== "object" || value === null) {
      throw new Error(`transcripts.json: ${id} の字幕データが不正です`);
    }
    const item = value as { text?: unknown; language?: unknown };
    if (
      typeof item.text !== "string" ||
      item.text.trim().length === 0 ||
      item.text.length > MAX_TEXT_LENGTH
    ) {
      throw new Error(`transcripts.json: ${id}.text が不正です`);
    }
    if (typeof item.language !== "string" || item.language.trim().length === 0) {
      throw new Error(`transcripts.json: ${id}.language が不正です`);
    }
    transcripts[id] = { text: item.text, language: item.language };
  }
  return { transcripts };
}

export function getTranscript(
  transcripts: TranscriptsData,
  video: Pick<Video, "id">,
): Transcript | null {
  return transcripts.transcripts[video.id] ?? null;
}
