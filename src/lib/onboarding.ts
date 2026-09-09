import type { Video } from "./youtube";

export interface OnboardingPanel {
  category: string;
  label: string;
  videos: Video[];
}

export function buildOnboardingPanels(
  panels: readonly OnboardingPanel[],
  featured: readonly Video[],
  limit = 4,
): OnboardingPanel[] {
  const featuredIds = new Set(featured.map((video) => video.id));
  return panels
    .map((panel) => ({
      ...panel,
      videos: [
        ...featured.filter((video) => panel.videos.some((candidate) => candidate.id === video.id)),
        ...panel.videos.filter((video) => !featuredIds.has(video.id)),
      ].slice(0, limit),
    }))
    .filter((panel) => panel.videos.length > 0);
}
