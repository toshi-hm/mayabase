export const INTEREST_REACTED_STORAGE_KEY = "mayabase:interest-reacted:v1";

export function parseReactedVideoIds(value: string | null): string[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export function addReactedVideoId(videoIds: readonly string[], videoId: string): string[] {
  return [...new Set([...videoIds, videoId])];
}
