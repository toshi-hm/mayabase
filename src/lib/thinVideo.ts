import type { Video } from "./youtube";

/**
 * 概要欄が空かつ再生時間が取得できない動画は、配信の抜け殻など実体の乏しいページになる(#601)。
 * こうした動画ページは noindex とし、サイトマップからも除外する。
 */
export function isThinVideo(video: Pick<Video, "description" | "duration">): boolean {
  return video.description.trim() === "" && video.duration === null;
}
