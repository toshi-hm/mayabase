import { readdir, readFile, writeFile } from "node:fs/promises";

type Video = {
  id: string;
  publishedAt: string;
};

type LighthouseConfig = {
  ci: {
    collect: {
      staticDistDir: string;
      url: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function selectVideoPaths(
  videos: Video[],
  availableIds: string[],
  count = 2,
): string[] {
  const available = new Set(availableIds);
  const sortedIds = videos
    .filter((video) => available.has(video.id))
    .toSorted((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .map((video) => video.id);
  const fallbackIds = availableIds.toSorted();

  return [...new Set([...sortedIds, ...fallbackIds])]
    .slice(0, count)
    .map((id) => `/videos/${id}/index.html`);
}

export async function generateLighthouseConfig(
  basePath = "lighthouserc.json",
  videosPath = "src/data/videos.json",
  distVideosPath = "dist/videos",
): Promise<LighthouseConfig> {
  const [baseConfig, videosData, availableIds] = await Promise.all([
    readFile(basePath, "utf8").then((content) => JSON.parse(content) as LighthouseConfig),
    readFile(videosPath, "utf8").then(
      (content) => JSON.parse(content) as { videos: Video[] },
    ),
    readdir(distVideosPath, { withFileTypes: true }).then((entries) =>
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ),
  ]);

  const videoPaths = selectVideoPaths(videosData.videos, availableIds);
  if (videoPaths.length === 0) {
    throw new Error("Lighthouse対象の動画ページがdist/videosに存在しません");
  }

  return {
    ...baseConfig,
    ci: {
      ...baseConfig.ci,
      collect: {
        ...baseConfig.ci.collect,
        url: [...baseConfig.ci.collect.url, ...videoPaths],
      },
    },
  };
}

if (import.meta.main) {
  const config = await generateLighthouseConfig();
  await writeFile("lighthouserc.generated.json", `${JSON.stringify(config, null, 2)}\n`);
}
