import { categorizeVideo } from "./categories";
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
  return panels
    .map((panel) => {
      const featuredForPanel = featured.filter(
        (video) => categorizeVideo(video) === panel.category,
      );
      const videos = [...featuredForPanel, ...panel.videos];
      const seenIds = new Set<string>();
      return {
        ...panel,
        videos: videos
          .filter((video) => {
            if (seenIds.has(video.id)) return false;
            seenIds.add(video.id);
            return true;
          })
          .slice(0, limit),
      };
    })
    .filter((panel) => panel.videos.length > 0);
}
